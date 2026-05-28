import type {
  AIAdapter,
  CodeGraph,
  Documentation,
  RepomapConfig,
  GitDiff,
  GenerateDocsOpts,
} from '@repomap/core'
import { compactForLLM, loadDocsSkill, debugDump, generateDocsParallel } from '@repomap/core'

// ─────────────────────────────────────────────────────────────────────────────
// OLLAMA ADAPTER
//
// Talks to a local Ollama HTTP server (default http://localhost:11434).
// Use case: private code, air-gapped environments, zero LLM spend.
//
// Setup on the user machine:
//   1. brew install ollama  (or download from https://ollama.com/download)
//   2. ollama pull qwen2.5-coder:7b   (or llama3.1:8b — see DEFAULT_MODEL)
//   3. ollama serve   (usually auto-started by the GUI app)
//
// We use /api/chat with format=json so Ollama constrains output to valid
// JSON, and bump num_ctx so the full prompt fits (system + skill + schema +
// compact graph can easily exceed the default 2048-token window).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'qwen2.5-coder:7b'
const DEFAULT_BASE_URL = 'http://localhost:11434'
const DEFAULT_CONTEXT_WINDOW = 32768
const DEFAULT_TEMPERATURE = 0.2

// Same schema shape as the other adapters — kept in the system prompt so
// the user prompt only carries the codebase data. We don't get prompt-cache
// benefits with Ollama, but it keeps the prompts comparable across adapters.
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
      "examples": [{"title": "string", "description": "string", "code": "string", "language": "string"}]
    }
  ],
  "integrations": {
    "summary": "how all services work together",
    "diagram": "mermaid sequence diagram of main flow",
    "flows": [{"name": "Main User Flow", "description": "string", "steps": ["step1"], "diagram": "mermaid"}]
  },
  "gettingStarted": {
    "quickStart":     {"title": "string", "summary": "string", "steps": [{"heading": "string", "description": "string"}]},
    "installation":   {"title": "string", "summary": "string", "steps": [{"heading": "string", "description": "string"}]},
    "firstProject":   {"title": "string", "summary": "string", "steps": [{"heading": "string", "description": "string"}]},
    "troubleshooting":{"title": "string", "summary": "string", "items":[{"problem":"string","solution":"string"}]}
  }
}`

export interface OllamaAdapterOptions {
  /** Model tag, e.g. 'qwen2.5-coder:7b' | 'llama3.1:8b' | 'deepseek-r1:7b'. Must be already pulled with `ollama pull`. */
  model?: string
  /** Ollama server base URL. Default http://localhost:11434. */
  baseUrl?: string
  /** num_ctx: context window in tokens. Default 32768. Bump higher for large repos. */
  contextWindow?: number
  /** Sampling temperature. Default 0.2 (low — output is mostly structured JSON). */
  temperature?: number
}

export class OllamaAdapter implements AIAdapter {
  private model: string
  private baseUrl: string
  private contextWindow: number
  private temperature: number
  // Single local model = no concurrency win from parallel calls. Stay single.
  defaultStrategy: 'parallel' | 'single' = 'single'

  constructor(opts: OllamaAdapterOptions = {}) {
    this.model = opts.model ?? DEFAULT_MODEL
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
    this.contextWindow = opts.contextWindow ?? DEFAULT_CONTEXT_WINDOW
    this.temperature = opts.temperature ?? DEFAULT_TEMPERATURE
  }

  /** Low-level chat primitive for parallel orchestration (opt-in). */
  async chat(opts: { systemPrompt: string; userPrompt: string; model?: string }): Promise<string> {
    const savedModel = this.model
    if (opts.model) this.model = opts.model
    try {
      const raw = await this.chatRaw(opts.systemPrompt, opts.userPrompt)
      return raw.message?.content ?? ''
    } finally {
      this.model = savedModel
    }
  }

  async generateDocs(graph: CodeGraph, config: RepomapConfig, opts?: GenerateDocsOpts): Promise<Documentation> {
    const strategy = config.ai.strategy ?? this.defaultStrategy
    if (strategy === 'parallel') {
      return generateDocsParallel(this, graph, config, {
        modelFast: config.ai.modelFast,
        apiReference: config.ai.apiReference,
        onProgress: opts?.onProgress,
      })
    }
    return this.generateDocsSingle(graph, config)
  }

  private async generateDocsSingle(graph: CodeGraph, config: RepomapConfig): Promise<Documentation> {
    const lang = config.language === 'es' ? 'Spanish' : 'English'
    const compact = compactForLLM(graph)
    const skill = loadDocsSkill()

    const baseSystem = [
      `You are a senior software architect and technical writer.`,
      `Generate world-class documentation for a multi-service system.`,
      `- Write in ${lang}.`,
      `- Output ONLY a single valid JSON object. No markdown fences, no preamble, no commentary.`,
    ].join('\n')

    const staticParts: string[] = []
    if (skill) staticParts.push(`=== DOCS WRITER PLAYBOOK (follow these standards) ===\n${skill.text}\n=== END PLAYBOOK ===`)
    staticParts.push(`=== OUTPUT JSON SCHEMA ===\n${DOC_JSON_SCHEMA}\n=== END SCHEMA ===`)

    const systemPrompt = `${baseSystem}\n\n${staticParts.join('\n\n')}`

    const userPrompt = `Here is the structural analysis of the system:

${compact}

Generate documentation following the JSON schema defined in the system prompt. Output only the JSON object, no markdown fences.`

    debugDump('compact-graph.txt', compact)
    debugDump('llm-system-prompt.txt', systemPrompt)
    debugDump('llm-user-prompt.txt', userPrompt)
    debugDump('llm-meta.json', JSON.stringify({
      adapter: 'ollama',
      model: this.model,
      baseUrl: this.baseUrl,
      contextWindow: this.contextWindow,
      temperature: this.temperature,
      systemPromptChars: systemPrompt.length,
      userPromptChars: userPrompt.length,
      compactChars: compact.length,
    }, null, 2))

    const raw = await this.chatRaw(systemPrompt, userPrompt)
    debugDump('llm-raw-response.json', JSON.stringify(raw, null, 2))

    const text = raw.message?.content ?? ''
    try {
      const doc = JSON.parse(stripJsonFences(text)) as Documentation
      doc.generatedAt = new Date().toISOString()
      debugDump('parsed-docs.json', JSON.stringify(doc, null, 2))
      return doc
    } catch (err: any) {
      debugDump('parse-error.txt', `${err?.stack ?? err}\n\n=== RAW TEXT ===\n${text}`)
      throw new Error(
        `Ollama returned non-JSON output. First 500 chars:\n${text.slice(0, 500)}\n\n` +
        `Tip: lower the temperature (--temperature 0.0) or pick a better-instructed model.`
      )
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

    const raw = await this.chatRaw(systemPrompt, userPrompt)
    const text = raw.message?.content ?? ''
    return JSON.parse(stripJsonFences(text)) as Documentation
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async chatRaw(systemPrompt: string, userPrompt: string): Promise<OllamaChatResponse> {
    const url = `${this.baseUrl}/api/chat`
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      format: 'json',
      stream: false,
      options: {
        num_ctx: this.contextWindow,
        temperature: this.temperature,
      },
    }

    let resp: Response
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (err: any) {
      const code = err?.cause?.code ?? err?.code
      if (code === 'ECONNREFUSED' || code === 'ENOTFOUND') {
        throw new Error(
          `Ollama server not reachable at ${this.baseUrl}.\n` +
          `Start it with:  ollama serve   (or open the Ollama desktop app)\n` +
          `Or set a different baseUrl in config.ai.baseUrl.`
        )
      }
      throw err
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => '')
      if (resp.status === 404 && text.includes('not found')) {
        throw new Error(
          `Ollama model '${this.model}' is not pulled on this server.\n` +
          `Pull it with:  ollama pull ${this.model}`
        )
      }
      throw new Error(`Ollama returned HTTP ${resp.status}: ${text.slice(0, 300)}`)
    }

    return (await resp.json()) as OllamaChatResponse
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface OllamaChatResponse {
  model: string
  created_at?: string
  message?: { role: string; content: string }
  done?: boolean
  total_duration?: number
  prompt_eval_count?: number
  eval_count?: number
  [k: string]: unknown
}

function stripJsonFences(text: string): string {
  // Some models still emit ```json … ``` despite format=json. Strip if present.
  const m = text.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/)
  return m ? m[1] : text.trim()
}

/**
 * Probe an Ollama server for reachability and (optionally) confirm a model
 * is pulled. Used by `repomap doctor` to give a clear diagnosis.
 */
export async function probeOllama(baseUrl: string = DEFAULT_BASE_URL, model?: string): Promise<{
  reachable: boolean
  modelAvailable?: boolean
  error?: string
}> {
  const url = baseUrl.replace(/\/+$/, '') + '/api/tags'
  try {
    const resp = await fetch(url)
    if (!resp.ok) return { reachable: false, error: `HTTP ${resp.status}` }
    const data = (await resp.json()) as { models?: Array<{ name: string }> }
    if (!model) return { reachable: true }
    const names = (data.models ?? []).map((m) => m.name)
    return { reachable: true, modelAvailable: names.includes(model) }
  } catch (err: any) {
    const code = err?.cause?.code ?? err?.code ?? 'unknown'
    return { reachable: false, error: code }
  }
}
