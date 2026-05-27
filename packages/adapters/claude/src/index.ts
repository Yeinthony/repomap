import Anthropic from '@anthropic-ai/sdk'
import type { AIAdapter, CodeGraph, Documentation, RepomapConfig, GitDiff } from '@repomap/core'
import { compactForLLM, loadDocsSkill, debugDump } from '@repomap/core'

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

// Static schema template — kept here (not in the user prompt) so it can be
// cached via cache_control. generatedAt is injected by the code after parsing.
const DOC_JSON_SCHEMA = `{
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
                "params": [{"name": "paramName", "type": "TypeName", "description": "what this param does", "required": true, "default": null}],
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
    "flows": [{"name": "Main User Flow", "description": "string", "steps": ["step1", "step2"], "diagram": "mermaid sequence diagram"}]
  },
  "gettingStarted": {
    "quickStart": {
      "title": "string — short tutorial title, e.g. 'Quick Start' / 'Inicio Rápido'",
      "summary": "1-2 sentence intro: what the reader will accomplish in this tutorial",
      "steps": [
        {
          "heading": "1. Step title",
          "description": "1-2 paragraphs of prose. Plain text only (no markdown). Use \\n\\n for paragraph breaks.",
          "code": {"language": "bash|typescript|yaml|json|...", "source": "code block content", "caption": "optional caption above the block"},
          "note": "optional callout text (tip, warning, info)",
          "noteKind": "tip|warning|info"
        }
      ]
    },
    "installation": {
      "title": "Installation",
      "summary": "1-2 sentences: prerequisites, time required, target audience",
      "steps": ["same TutorialStep shape as quickStart — prerequisites, install commands, verification, common flags"]
    },
    "firstProject": {
      "title": "Your first project — pick a contextual name (e.g. 'Tu primer pipeline', 'Build your first endpoint', 'Document your first repo')",
      "summary": "1-2 sentences: end-to-end goal of this tutorial — what the reader builds",
      "steps": ["same TutorialStep shape — a real walk-through from zero to a working end-to-end result, 4-7 steps"]
    },
    "troubleshooting": {
      "title": "Troubleshooting",
      "summary": "1-2 sentences: scope of issues covered, where to go for more help",
      "items": [
        {
          "problem": "Error message or symptom — phrase as the reader sees it",
          "cause": "1-2 sentences explaining why this happens (optional)",
          "solution": "1-2 paragraphs of prose with the fix",
          "code": {"language": "bash|...", "source": "optional fix command or snippet"}
        }
      ]
    }
  }
}

GETTING STARTED GUIDANCE:
- Produce ALL FOUR sections (quickStart, installation, firstProject, troubleshooting). Skip a section ONLY if there's truly no information available.
- quickStart: minimum-viable path to first success. 3-5 steps. Assume zero prior context.
- installation: prerequisites, install commands per OS if relevant, verification step, common errors inline.
- firstProject: a real end-to-end walkthrough using the actual symbols/endpoints/commands of this codebase (not generic). 4-7 steps.
- troubleshooting: 5-10 items minimum. Mine the README and code for actual error messages users hit ('command not found', 'auth failure', 'quota', etc.).
- Tutorials are PEDAGOGICAL — explain the why, not just the what. Use second-person ("you", "tú"). Anticipate questions.
- Code blocks MUST be syntactically valid and copy-pasteable.`

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

    // One cached block holds both the playbook and the output schema.
    // Both are static across runs so they share a single cache checkpoint,
    // which lowers cost on repeated calls (watch mode, re-runs).
    const staticParts: string[] = []
    if (skill) staticParts.push(`=== DOCS WRITER PLAYBOOK (follow these standards) ===\n${skill.text}\n=== END PLAYBOOK ===`)
    staticParts.push(`=== OUTPUT JSON SCHEMA ===\n${DOC_JSON_SCHEMA}\n=== END SCHEMA ===`)

    const systemBlocks: any[] = [
      { type: 'text', text: baseSystem },
      { type: 'text', text: staticParts.join('\n\n'), cache_control: { type: 'ephemeral' } },
    ]

    const userPrompt = `Here is the structural analysis of the system:

${compactRepr}

Generate documentation following the JSON schema defined in the system prompt. Output only the JSON object, no markdown fences.`

    debugDump('compact-graph.txt', compactRepr)
    debugDump('llm-system-prompt.txt', systemBlocks.map((b: any) => b.text).join('\n\n'))
    debugDump('llm-user-prompt.txt', userPrompt)
    debugDump('llm-meta.json', JSON.stringify({
      adapter: 'claude',
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      systemBlocksChars: systemBlocks.map((b: any) => b.text.length),
      userPromptChars: userPrompt.length,
      compactChars: compactRepr.length,
    }, null, 2))

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemBlocks,
    })

    debugDump('llm-raw-response.json', JSON.stringify(response, null, 2))

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    try {
      const doc = JSON.parse(text) as Documentation
      doc.generatedAt = new Date().toISOString()
      debugDump('parsed-docs.json', JSON.stringify(doc, null, 2))
      return doc
    } catch (err: any) {
      debugDump('parse-error.txt', `${err?.stack ?? err}\n\n=== RAW TEXT ===\n${text}`)
      throw err
    }
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
${JSON.stringify(existing)}

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
