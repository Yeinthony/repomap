import { spawn } from 'child_process'
import os from 'os'
import path from 'path'
import type {
  AIAdapter,
  CodeGraph,
  Documentation,
  RepomapConfig,
  GitDiff,
} from '@repomap/core'
import { compactForLLM, loadDocsSkill } from '@repomap/core'

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE CODE ADAPTER
// Invokes the `claude` CLI in non-interactive (print) mode. Uses the user's
// existing Claude Code authentication (Pro/Max subscription), so no
// ANTHROPIC_API_KEY is required.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClaudeCodeAdapterOptions {
  model?: string                // 'sonnet' | 'opus' | full id; default 'sonnet'
  binary?: string               // override path to `claude` CLI
  maxBudgetUsd?: number         // safety cap per call
}

export class ClaudeCodeAdapter implements AIAdapter {
  private model: string
  private binary: string
  private maxBudgetUsd?: number

  constructor(opts: ClaudeCodeAdapterOptions = {}) {
    this.model = opts.model ?? 'sonnet'
    this.binary = opts.binary ?? 'claude'
    this.maxBudgetUsd = opts.maxBudgetUsd
  }

  async generateDocs(graph: CodeGraph, config: RepomapConfig): Promise<Documentation> {
    const lang = config.language === 'es' ? 'Spanish' : 'English'
    const compact = compactForLLM(graph)
    const skill = loadDocsSkill()

    const baseSystem = [
      `You are a senior software architect and technical writer.`,
      `Generate world-class documentation for a multi-service system.`,
      `- Write in ${lang}.`,
      `- Output ONLY a single valid JSON object. No markdown fences, no preamble, no commentary.`,
    ].join('\n')

    const systemPrompt = skill
      ? `${baseSystem}\n\n=== DOCS WRITER PLAYBOOK (follow these standards) ===\n${skill.text}\n=== END PLAYBOOK ===`
      : baseSystem

    const userPrompt = `Here is the structural analysis of the system:

${compact}

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
      "events": [{"name": "string", "type": "publishes", "description": "string"}],
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
    "diagram": "mermaid sequence diagram of the main flow",
    "flows": [
      {"name": "Main User Flow", "description": "string", "steps": ["step1"], "diagram": "mermaid sequence diagram"}
    ]
  },
  "generatedAt": "${new Date().toISOString()}"
}`

    const raw = await this.runClaude(systemPrompt, userPrompt)
    return parseDocumentation(raw)
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
${JSON.stringify(existing, null, 2)}

Return the COMPLETE updated documentation JSON. Only modify what actually changed; keep everything else identical.`

    const raw = await this.runClaude(systemPrompt, userPrompt)
    return parseDocumentation(raw)
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private runClaude(systemPrompt: string, userPrompt: string): Promise<string> {
    const args = [
      '-p',
      '--output-format', 'json',
      '--no-session-persistence',
      '--model', this.model,
      '--system-prompt', systemPrompt,
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
