import Anthropic from '@anthropic-ai/sdk'
import type { AIAdapter, CodeGraph, Documentation, RepomapConfig, GitDiff, GenerateDocsOpts } from '@repomap/core'
import { compactForLLM, loadDocsSkill, debugDump, generateDocsParallel } from '@repomap/core'

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE ADAPTER
// ─────────────────────────────────────────────────────────────────────────────

// Schema fragment for the symbol-level API reference. Optional — gated by
// config.ai.apiReference. Inlining it adds ~4-5K output tokens *per service*.
const API_REFERENCE_FRAGMENT = `,
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
      }`

function buildDocJsonSchema(opts: { withApiReference: boolean; lean?: boolean }): string {
  if (opts.lean) return buildCompactDocSchema(opts.withApiReference)
  const apiRef = opts.withApiReference ? API_REFERENCE_FRAGMENT : ''
  const apiRefNote = opts.withApiReference
    ? ''
    : `\n- OMIT the "apiReference" field entirely from every service object. Do not generate it.`
  return `{
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
      "examples": [{"title": "string", "description": "string", "code": "string", "language": "string"}]${apiRef}
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
- Code blocks MUST be syntactically valid and copy-pasteable.${apiRefNote}`
}

// Lean schema: TS-like one-shot description that the LLM can follow without
// the JSON-pretty noise. Saves ~1-2K tokens per call vs the legacy form.
function buildCompactDocSchema(withApiReference: boolean): string {
  const apiRef = withApiReference
    ? `;\n    apiReference: { intro: string; sections: Array<{ title: string; description?: string; symbols: Array<{ name: string; kind: 'function'|'class'|'interface'|'type'|'variable'|'method'; signature: string; description: string; params?: Array<{ name: string; type?: string; description: string; required: boolean; default?: string }>; returns?: string; sourceFile?: string; example?: string }> }> }`
    : ''
  const apiRefRule = withApiReference ? '' : '\n- OMIT apiReference entirely from every service object.'
  return `// Documentation — produce a single JSON object matching this shape.
type TutorialStep = {
  heading: string; description: string;
  code?: { language: string; source: string; caption?: string };
  note?: string; noteKind?: 'tip' | 'warning' | 'info';
};
{
  overview: { title: string; summary: string; analogy?: string; architecture: string /* mermaid */; keyConceptsFor: string[] };
  services: Array<{
    name: string; purpose: string; longDescription: string /* 3-5 paragraphs */;
    analogy?: string; architecture: string /* mermaid */;
    endpoints: Array<{ method: string; path: string; description: string; requestExample?: string; responseExample?: string }>;
    events: Array<{ name: string; type: 'publishes' | 'subscribes'; description: string }>;
    envVars: Array<{ name: string; description: string; required: boolean; example?: string }>;
    gettingStarted: string /* step by step to run locally */;
    examples: Array<{ title: string; description: string; code: string; language: string }>${apiRef}
  }>;
  integrations: {
    summary: string; diagram: string /* mermaid sequence */;
    flows: Array<{ name: string; description: string; steps: string[]; diagram: string }>;
  };
  gettingStarted: {
    quickStart: { title: string; summary: string; steps: TutorialStep[] /* 3-5 */ };
    installation: { title: string; summary: string; steps: TutorialStep[] };
    firstProject: { title: string; summary: string; steps: TutorialStep[] /* 4-7 */ };
    troubleshooting: { title: string; summary: string; items: Array<{ problem: string; cause?: string; solution: string; code?: { language: string; source: string } }> /* 5-10 */ };
  };
}

Rules:
- Produce ALL FOUR gettingStarted sub-sections; skip ONLY when no info is available.
- Code blocks must be syntactically valid and copy-pasteable.
- Use second-person ('you' / 'tú'). Plain text in descriptions (use \\n\\n for paragraph breaks).
- Troubleshooting items mined from actual error messages in the README/code.${apiRefRule}`
}

export class ClaudeAdapter implements AIAdapter {
  private client: Anthropic
  // Caching makes per-section parallelism a clear win here.
  defaultStrategy: 'parallel' | 'single' = 'parallel'
  private defaultModel = 'claude-sonnet-4-20250514'
  // Aliases so users can pass 'sonnet' / 'opus' / 'haiku' in config.
  private modelAliases: Record<string, string> = {
    sonnet: 'claude-sonnet-4-20250514',
    opus: 'claude-opus-4-1-20250805',
    haiku: 'claude-haiku-4-5-20251001',
  }

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY })
  }

  /** Low-level chat primitive used by the parallel orchestrator. */
  async chat(opts: { systemPrompt: string; userPrompt: string; model?: string; maxTokens?: number }): Promise<string> {
    const model = this.resolveModel(opts.model)
    const response = await this.client.messages.create({
      // max_tokens is a HARD CAP, not a billing budget — the API only
      // charges for actual output tokens. Erring high prevents silent
      // truncation (broken JSON) on big responses; the per-call orchestrator
      // can still pass an explicit number when it knows better.
      model,
      max_tokens: opts.maxTokens ?? 16000,
      // Single cached block for the whole system prompt — adapters using chat()
      // are expected to pass a long, stable prefix (skill + schema) followed
      // by the per-call instructions. The 5-min cache TTL covers a full
      // generate run with parallel sub-calls.
      system: [{ type: 'text', text: opts.systemPrompt, cache_control: { type: 'ephemeral' } }] as any,
      messages: [{ role: 'user', content: opts.userPrompt }],
    })
    return response.content.filter((b) => b.type === 'text').map((b) => (b as any).text).join('')
  }

  /** Pick a max_tokens cap for `generateDocsSingle` based on what the LLM
   *  will need to emit: roughly 1500 tokens of overhead + 800 per service,
   *  ×4 when apiReference inflates the per-service output with symbol-level
   *  docs. Capped to a model-safe ceiling (Sonnet 4 = 64K). Erring high is
   *  free because the API only charges for actual tokens generated. */
  private singleMaxTokens(repoCount: number, withApiReference: boolean): number {
    const perRepo = withApiReference ? 3200 : 800
    const estimated = 1500 + perRepo * repoCount
    // Floor 8000 (so a 1-repo run still has slack), ceiling 32000 (well under
    // Sonnet 4's 64K limit but enough for ~10 services with apiRef).
    return Math.max(8000, Math.min(32000, estimated))
  }

  private resolveModel(name?: string): string {
    if (!name) return this.defaultModel
    return this.modelAliases[name] ?? name
  }

  async generateDocs(graph: CodeGraph, config: RepomapConfig, opts?: GenerateDocsOpts): Promise<Documentation> {
    const strategy = config.ai.strategy ?? this.defaultStrategy
    if (strategy === 'parallel') {
      return generateDocsParallel(this, graph, config, {
        modelFast: this.resolveModel(config.ai.modelFast ?? 'haiku'),
        apiReference: config.ai.apiReference,
        onProgress: opts?.onProgress,
      })
    }
    return this.generateDocsSingle(graph, config, opts)
  }

  /** Legacy single-call path. Used when strategy: 'single' is set. */
  private async generateDocsSingle(graph: CodeGraph, config: RepomapConfig, opts?: GenerateDocsOpts): Promise<Documentation> {
    const lang = config.language === 'es' ? 'Spanish' : 'English'
    const lean = !!config.ai.lean
    const compactRepr = compactForLLM(graph, { lean, budget: config.ai.budget })
    const withApiReference = config.ai.sections?.apiReference ?? config.ai.apiReference ?? false
    const schema = buildDocJsonSchema({ withApiReference, lean })

    const baseSystem = `You are a senior software architect and technical writer.
Generate world-class documentation for a multi-service system.
- Write in ${lang}
- Output ONLY valid JSON, no markdown fences, no preamble`

    // Single-call path: legacy 'full' skill unless `ai.skillSections` opts
    // into a narrower set. Lean mode prefers `_compact/*.md` versions when
    // present.
    const skillSectionsCfg = config.ai.skillSections
    const skill = loadDocsSkill(
      skillSectionsCfg && skillSectionsCfg !== 'full' && skillSectionsCfg !== 'auto'
        ? { sections: skillSectionsCfg, lean }
        : skillSectionsCfg === 'auto'
          ? { sections: ['templates', 'diataxis', 'writing', 'diagrams', 'examples'], lean }
          : { lean }
    )

    // One cached block holds both the playbook and the output schema.
    // Both are static across runs so they share a single cache checkpoint,
    // which lowers cost on repeated calls (watch mode, re-runs).
    const staticParts: string[] = []
    if (skill) staticParts.push(`=== DOCS WRITER PLAYBOOK (follow these standards) ===\n${skill.text}\n=== END PLAYBOOK ===`)
    staticParts.push(`=== OUTPUT JSON SCHEMA ===\n${schema}\n=== END SCHEMA ===`)

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
    const maxTokens = this.singleMaxTokens(graph.repos.length, withApiReference)
    debugDump('llm-meta.json', JSON.stringify({
      adapter: 'claude',
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      apiReference: withApiReference,
      lean,
      budget: config.ai.budget ?? (lean ? 8000 : 20000),
      skillChars: skill?.text.length ?? 0,
      skillSectionsLoaded: skill?.sectionsLoaded ?? [],
      schemaChars: schema.length,
      systemBlocksChars: systemBlocks.map((b: any) => b.text.length),
      userPromptChars: userPrompt.length,
      compactChars: compactRepr.length,
    }, null, 2))

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemBlocks,
    })

    debugDump('llm-raw-response.json', JSON.stringify(response, null, 2))

    // Report usage so the CLI can show cost + tokens after the call.
    if (opts?.onProgress && response.usage) {
      const u = response.usage as any
      const input = u.input_tokens ?? 0
      const output = u.output_tokens ?? 0
      const cacheRead = u.cache_read_input_tokens ?? 0
      const cacheCreate = u.cache_creation_input_tokens ?? 0
      // Sonnet 4 pricing (per million tokens): input $3, output $15,
      // cache write $3.75, cache read $0.30. Adjust if model changes.
      const costUsd = (input * 3 + output * 15 + cacheCreate * 3.75 + cacheRead * 0.3) / 1_000_000
      opts.onProgress({
        kind: 'result-meta',
        costUsd,
        inputTokens: input,
        outputTokens: output,
        cacheReadTokens: cacheRead,
        cacheCreationTokens: cacheCreate,
      })
    }

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

/**
 * Query Anthropic's /v1/models endpoint for the models the account has
 * access to. Used by `repomap init` to populate the model picker with REAL
 * values. Falls back gracefully when no API key is available or the request
 * fails — callers should treat an empty list as "no probe data".
 */
export async function probeClaudeModels(apiKey?: string): Promise<{
  reachable: boolean
  /** List of model IDs (e.g. 'claude-sonnet-4-6'), or [] when probe failed. */
  models?: Array<{ id: string; displayName?: string }>
  error?: string
}> {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY
  if (!key) return { reachable: false, error: 'no ANTHROPIC_API_KEY' }
  try {
    const resp = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
    })
    if (!resp.ok) return { reachable: false, error: `HTTP ${resp.status}` }
    const data = (await resp.json()) as { data?: Array<{ id: string; display_name?: string }> }
    return {
      reachable: true,
      models: (data.data ?? []).map((m) => ({ id: m.id, displayName: m.display_name })),
    }
  } catch (err: any) {
    return { reachable: false, error: err?.message ?? String(err) }
  }
}
