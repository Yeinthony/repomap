import { spawn } from 'child_process'
import os from 'os'
import path from 'path'
import type {
  AIAdapter,
  AdapterProgress,
  CodeGraph,
  Documentation,
  RepomapConfig,
  GitDiff,
  GenerateDocsOpts,
} from '@repomap/core'
import { compactForLLM, loadDocsSkill, debugDump, generateDocsParallel } from '@repomap/core'

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE CODE ADAPTER
// Invokes the `claude` CLI in non-interactive (print) mode. Uses the user's
// existing Claude Code authentication (Pro/Max subscription), so no
// ANTHROPIC_API_KEY is required.
// ─────────────────────────────────────────────────────────────────────────────

// Schema fragment for the symbol-level API reference. Optional — gated by
// config.ai.apiReference. Inlining it adds ~4-5K output tokens *per service*,
// which on a 6-service repo can be the difference between hitting the daily
// limit and finishing in one shot.
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
      "events": [{"name": "string", "type": "publishes", "description": "string"}],
      "envVars": [{"name": "string", "description": "string", "required": true, "example": "string"}],
      "gettingStarted": "step by step to run locally",
      "examples": [{"title": "string", "description": "string", "code": "string", "language": "string"}]${apiRef}
    }
  ],
  "integrations": {
    "summary": "how all services work together",
    "diagram": "mermaid sequence diagram of the main flow",
    "flows": [{"name": "Main User Flow", "description": "string", "steps": ["step1"], "diagram": "mermaid sequence diagram"}]
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

// Lean schema: TS-like description that saves ~1-2K tokens per call vs the
// legacy pretty-printed JSON. claude-code doesn't expose cache flags, so
// every saved token translates directly into cheaper/faster calls.
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
    gettingStarted: string;
    examples: Array<{ title: string; description: string; code: string; language: string }>${apiRef}
  }>;
  integrations: {
    summary: string; diagram: string;
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
- Code blocks must be valid and copy-pasteable. Use second-person ('you' / 'tú').${apiRefRule}`
}

export interface ClaudeCodeAdapterOptions {
  model?: string                // 'sonnet' | 'opus' | full id; default 'sonnet'
  binary?: string               // override path to `claude` CLI
  maxBudgetUsd?: number         // safety cap per call
}

export class ClaudeCodeAdapter implements AIAdapter {
  private model: string
  private binary: string
  private maxBudgetUsd?: number
  // `claude -p` doesn't expose prompt caching via flags, so parallel sub-calls
  // would pay full price on every system-prompt round-trip. Stay single by
  // default; users can override with ai.strategy: parallel if they accept the
  // higher cost in exchange for lower latency.
  defaultStrategy: 'parallel' | 'single' = 'single'

  constructor(opts: ClaudeCodeAdapterOptions = {}) {
    this.model = opts.model ?? 'sonnet'
    this.binary = opts.binary ?? 'claude'
    this.maxBudgetUsd = opts.maxBudgetUsd
  }

  /** Low-level chat primitive for the parallel orchestrator (when opted-in). */
  async chat(opts: { systemPrompt: string; userPrompt: string; model?: string }): Promise<string> {
    const raw = await this.runClaude(opts.systemPrompt, opts.userPrompt, opts.model)
    const env = JSON.parse(raw) as { result?: string; is_error?: boolean; subtype?: string }
    if (env.is_error || env.subtype === 'error') {
      throw new Error(`Claude Code returned an error envelope: ${JSON.stringify(env).slice(0, 500)}`)
    }
    if (typeof env.result !== 'string') {
      throw new Error(`Claude Code envelope missing 'result' field`)
    }
    return env.result
  }

  async generateDocs(graph: CodeGraph, config: RepomapConfig, opts?: GenerateDocsOpts): Promise<Documentation> {
    const strategy = config.ai.strategy ?? this.defaultStrategy
    if (strategy === 'parallel') {
      return generateDocsParallel(this, graph, config, {
        modelFast: config.ai.modelFast ?? 'haiku',
        apiReference: config.ai.apiReference,
        onProgress: opts?.onProgress,
      })
    }
    return this.generateDocsSingle(graph, config, opts)
  }

  private async generateDocsSingle(graph: CodeGraph, config: RepomapConfig, opts?: GenerateDocsOpts): Promise<Documentation> {
    const lang = config.language === 'es' ? 'Spanish' : 'English'
    const lean = !!config.ai.lean
    const compact = compactForLLM(graph, { lean, budget: config.ai.budget })
    const skill = loadDocsSkill({ lean })
    const withApiReference = config.ai.sections?.apiReference ?? config.ai.apiReference ?? false
    const schema = buildDocJsonSchema({ withApiReference, lean })

    const baseSystem = [
      `You are a senior software architect and technical writer.`,
      `Generate world-class documentation for a multi-service system.`,
      `- Write in ${lang}.`,
      `- Output ONLY a single valid JSON object. No markdown fences, no preamble, no commentary.`,
    ].join('\n')

    const staticParts: string[] = []
    if (skill) staticParts.push(`=== DOCS WRITER PLAYBOOK (follow these standards) ===\n${skill.text}\n=== END PLAYBOOK ===`)
    staticParts.push(`=== OUTPUT JSON SCHEMA ===\n${schema}\n=== END SCHEMA ===`)

    const systemPrompt = `${baseSystem}\n\n${staticParts.join('\n\n')}`

    const userPrompt = `Here is the structural analysis of the system:

${compact}

Generate documentation following the JSON schema defined in the system prompt. Output only the JSON object, no markdown fences.`

    debugDump('compact-graph.txt', compact)
    debugDump('llm-system-prompt.txt', systemPrompt)
    debugDump('llm-user-prompt.txt', userPrompt)
    debugDump('llm-meta.json', JSON.stringify({
      adapter: 'claude-code',
      model: this.model,
      binary: this.binary,
      maxBudgetUsd: this.maxBudgetUsd,
      apiReference: withApiReference,
      lean,
      budget: config.ai.budget ?? (lean ? 8000 : 20000),
      skillChars: skill?.text.length ?? 0,
      skillSectionsLoaded: skill?.sectionsLoaded ?? [],
      schemaChars: schema.length,
      systemPromptChars: systemPrompt.length,
      userPromptChars: userPrompt.length,
      compactChars: compact.length,
    }, null, 2))

    const raw = await this.runClaude(systemPrompt, userPrompt)
    debugDump('llm-raw-response.json', raw)
    // Surface cost/usage even on parse failure or error envelopes, so the user
    // sees what was spent on a rate-limit hit.
    emitMetaFromEnvelope(raw, opts?.onProgress)
    try {
      const doc = parseDocumentation(raw)
      doc.generatedAt = new Date().toISOString()
      debugDump('parsed-docs.json', JSON.stringify(doc, null, 2))
      return doc
    } catch (err: any) {
      debugDump('parse-error.txt', String(err?.stack ?? err))
      throw err
    }
  }

  async updateDocs(
    existing: Documentation,
    diff: GitDiff,
    config: RepomapConfig
  ): Promise<Documentation> {
    const lang = config.language === 'es' ? 'Spanish' : 'English'

    const changedSummary = diff.changedFiles.map((f) => `${f.status}: ${f.path}`).join('\n')
    const diffSnippet = diff.changedFiles
      .slice(0, 3)
      .map((f) => f.diff.slice(0, 500))
      .join('\n---\n')

    const skill = loadDocsSkill()
    const baseSystem = `You update existing documentation based on code changes. Output ONLY a single valid JSON object. Write in ${lang}.`
    const systemPrompt = skill
      ? `${baseSystem}\n\n=== DOCS WRITER PLAYBOOK ===\n${skill.text}\n=== END PLAYBOOK ===`
      : baseSystem
    const userPrompt = `The following files changed in repo "${diff.repo}" (commit ${diff.commit}):

${changedSummary}

Diff preview:
${diffSnippet}

Current documentation:
${JSON.stringify(existing)}

Return the COMPLETE updated documentation JSON. Only modify what actually changed; keep everything else identical.`

    const raw = await this.runClaude(systemPrompt, userPrompt)
    return parseDocumentation(raw)
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private runClaude(systemPrompt: string, userPrompt: string, modelOverride?: string): Promise<string> {
    const args = [
      '-p',
      '--output-format', 'json',
      '--no-session-persistence',
      '--model', modelOverride ?? this.model,
      '--system-prompt', systemPrompt,
      // Force a pure prompt→JSON round-trip. Without this, `claude -p` keeps
      // Read/Grep/Glob/Bash available and the model can decide to explore the
      // repo itself when the compact graph looks thin — burning the daily
      // token budget on tool calls and never emitting the final JSON.
      '--disallowedTools', 'Read,Write,Edit,Bash,Grep,Glob,WebFetch,WebSearch,NotebookEdit,Task',
    ]
    if (this.maxBudgetUsd != null) {
      args.push('--max-budget-usd', String(this.maxBudgetUsd))
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(this.binary, args, {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: { ...process.env, PATH: enrichedPath() },
      })

      let stdout = ''
      proc.stdout.on('data', (chunk) => { stdout += chunk.toString() })

      proc.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          reject(new Error(
            `'${this.binary}' (Claude Code CLI) not found on PATH.\n` +
            `Install Claude Code from https://claude.com/code`
          ))
        } else {
          reject(err)
        }
      })

      proc.on('exit', (code) => {
        if (code === 0) resolve(stdout)
        else reject(new Error(`claude exited with code ${code}. Stdout:\n${stdout.slice(0, 500)}`))
      })

      proc.stdin.write(userPrompt)
      proc.stdin.end()
    })
  }
}

// ── Output parsing ──────────────────────────────────────────────────────────

/**
 * The `claude -p --output-format json` envelope looks like:
 *   {
 *     "type": "result",
 *     "subtype": "success" | "error",
 *     "result": "<the assistant's text response>",
 *     "session_id": "...",
 *     "total_cost_usd": 0.012,
 *     "duration_ms": 1234,
 *     "is_error": false
 *   }
 * We extract `.result`, strip any accidental ```json fences, and parse it
 * as the actual Documentation object.
 */
function parseDocumentation(stdout: string): Documentation {
  let envelope: unknown
  try {
    envelope = JSON.parse(stdout)
  } catch {
    throw new Error(`Claude Code returned non-JSON output:\n${stdout.slice(0, 500)}`)
  }

  const env = envelope as { result?: string; is_error?: boolean; subtype?: string }
  if (env.is_error || env.subtype === 'error') {
    throw new Error(`Claude Code returned an error envelope: ${JSON.stringify(envelope).slice(0, 500)}`)
  }
  if (typeof env.result !== 'string') {
    throw new Error(`Claude Code envelope missing 'result' field`)
  }

  const stripped = stripJsonFences(env.result.trim())
  try {
    return JSON.parse(stripped) as Documentation
  } catch (err) {
    throw new Error(
      `Claude Code's response was not valid JSON. First 500 chars:\n${stripped.slice(0, 500)}`
    )
  }
}

function stripJsonFences(text: string): string {
  // ```json ... ```  or  ``` ... ```
  const m = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return m ? m[1] : text
}

/**
 * Parse the claude-code envelope and forward cost/usage to the progress
 * listener. Tolerant of malformed envelopes (just bails). Called on both
 * success and error paths — surfaces the spend on rate-limit hits.
 */
function emitMetaFromEnvelope(stdout: string, onProgress?: (e: AdapterProgress) => void): void {
  if (!onProgress) return
  try {
    const env = JSON.parse(stdout) as {
      total_cost_usd?: number
      usage?: {
        input_tokens?: number
        output_tokens?: number
        cache_read_input_tokens?: number
        cache_creation_input_tokens?: number
      }
    }
    onProgress({
      kind: 'result-meta',
      costUsd: env.total_cost_usd,
      inputTokens: env.usage?.input_tokens,
      outputTokens: env.usage?.output_tokens,
      cacheReadTokens: env.usage?.cache_read_input_tokens,
      cacheCreationTokens: env.usage?.cache_creation_input_tokens,
    })
  } catch {
    /* envelope wasn't JSON — nothing to report */
  }
}

function enrichedPath(): string {
  const home = os.homedir()
  const extras = [
    path.join(home, '.claude', 'local'),         // claude install dir
    path.join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  const current = (process.env.PATH ?? '').split(path.delimiter)
  const merged = [...current, ...extras.filter((p) => !current.includes(p))]
  return merged.join(path.delimiter)
}
