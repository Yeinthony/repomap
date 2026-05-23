import Anthropic from '@anthropic-ai/sdk'
import type { AIAdapter, CodeGraph, Documentation, RepomapConfig, GitDiff } from '@repomap/core'
import { compactForLLM, loadDocsSkill } from '@repomap/core'

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

export class ClaudeAdapter implements AIAdapter {
  private client: Anthropic

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY })
  }

  async generateDocs(graph: CodeGraph, config: RepomapConfig): Promise<Documentation> {
    const lang = config.language === 'es' ? 'Spanish' : 'English'
    const compactRepr = compactForLLM(graph)

    const baseSystem = `You are a senior software architect and technical writer.
Generate world-class documentation for a multi-service system.
- Write in ${lang}
- Output ONLY valid JSON, no markdown fences, no preamble`

    const skill = loadDocsSkill()

    const userPrompt = `Here is the structural analysis of the system:

${compactRepr}

Generate documentation following this EXACT JSON structure:
{
  "overview": {
    "title": "string",
    "summary": "2-3 sentence plain-language summary",
    "analogy": "A real-world analogy explaining the whole system",
    "architecture": "mermaid diagram source (graph TD)",
    "keyConceptsFor": ["concept1", "concept2"]
  },
  "services": [
    {
      "name": "string",
      "purpose": "one sentence",
      "longDescription": "full explanation, 3-5 paragraphs",
      "analogy": "real-world analogy for this specific service",
      "architecture": "mermaid diagram source",
      "endpoints": [{"method": "GET", "path": "/example", "description": "string", "requestExample": "optional", "responseExample": "optional"}],
      "events": [{"name": "string", "type": "publishes|subscribes", "description": "string"}],
      "envVars": [{"name": "string", "description": "string", "required": true, "example": "string"}],
      "gettingStarted": "step by step to run locally",
      "examples": [{"title": "string", "description": "string", "code": "string", "language": "string"}],
      "apiReference": {
        "intro": "1-2 sentences describing the public API surface of this service",
        "sections": [
          {
            "title": "Functions",
            "description": "optional section description",
            "symbols": [
              {
                "name": "symbolName",
                "kind": "function | class | interface | type | variable | method",
                "signature": "full signature string e.g. async function foo(x: string): Promise<Bar>",
                "description": "what it does, why it exists, when to use it — 2-4 sentences",
                "params": [
                  {"name": "paramName", "type": "TypeName", "description": "what this param does", "required": true, "default": null}
                ],
                "returns": "what is returned and what to do with it",
                "sourceFile": "relative/path/to/file.ts",
                "example": "short usage code snippet"
              }
            ]
          }
        ]
      }
    }
  ],
  "integrations": {
    "summary": "how all services work together",
    "diagram": "mermaid sequence diagram of main flow",
    "flows": [
      {
        "name": "Main User Flow",
        "description": "string",
        "steps": ["step1", "step2"],
        "diagram": "mermaid sequence diagram"
      }
    ]
  },
  "generatedAt": "${new Date().toISOString()}"
}`

    // Split the system prompt: short instructions (uncached) + skill body
    // (cached via cache_control). Anthropic prompt caching dramatically lowers
    // cost when the skill is reused across runs.
    const systemBlocks: any[] = [{ type: 'text', text: baseSystem }]
    if (skill) {
      systemBlocks.push({
        type: 'text',
        text: `=== DOCS WRITER PLAYBOOK (follow these standards) ===\n${skill.text}\n=== END PLAYBOOK ===`,
        cache_control: { type: 'ephemeral' },
      })
    }

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemBlocks,
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    return JSON.parse(text) as Documentation
  }

  async updateDocs(
    existing: Documentation,
    diff: GitDiff,
    config: RepomapConfig
  ): Promise<Documentation> {
    const lang = config.language === 'es' ? 'Spanish' : 'English'

    const changedSummary = diff.changedFiles
      .map((f) => `${f.status}: ${f.path}`)
      .join('\n')

    const skill = loadDocsSkill()
    const updateSystem: any[] = [
      { type: 'text', text: `You update existing documentation based on code changes. Output ONLY valid JSON.` },
    ]
    if (skill) {
      updateSystem.push({
        type: 'text',
        text: `=== DOCS WRITER PLAYBOOK ===\n${skill.text}\n=== END PLAYBOOK ===`,
        cache_control: { type: 'ephemeral' },
      })
    }

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: updateSystem,
      messages: [
        {
          role: 'user',
          content: `The following files changed in repo "${diff.repo}" (commit ${diff.commit}):

${changedSummary}

Diff preview:
${diff.changedFiles
  .slice(0, 3)
  .map((f) => f.diff.slice(0, 500))
  .join('\n---\n')}

Current documentation:
${JSON.stringify(existing, null, 2)}

Update the documentation to reflect these changes. Return the complete updated documentation JSON in ${lang}.
Only modify what actually changed. Keep everything else identical.`,
        },
      ],
    })

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    return JSON.parse(text) as Documentation
  }
}
