import fs from 'fs'
import path from 'path'
import chokidar from 'chokidar'
import { simpleGit } from 'simple-git'
import type {
  RepomapConfig,
  CodeGraph,
  Documentation,
  AIAdapter,
  GitDiff,
  RepoSummary,
  AdapterProgress,
} from './types.js'
import { runGraphify, mergeGraphifyGraphs, isGraphifyAvailable } from './graphify/runner.js'
import { buildRepoSummary, detectHttpCalls } from './detectors/index.js'
import { readPackageMeta } from './detectors/repo-summary.js'
import { generateHTML, generateMarkdown } from './render/html.js'
import { debugDumpJson } from './debug.js'
import { compactForLLM } from './serialize.js'
import { loadDocsSkill } from './render/docs-skill-loader.js'

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATOR
// Pipeline:
//   1. per-repo:  graphify pipeline.py / update    (AST, no LLM)
//                 buildRepoSummary(repo)           (endpoints, env, deps, docker)
//   2. global:    graphify merge-graphs            (cross-repo graph.json)
//                 detectHttpCalls(repos)           (fetch/axios → repo→repo edges)
//   3. LLM:       adapter.generateDocs(graph)
//   4. write:     HTML/Markdown/JSON
// ─────────────────────────────────────────────────────────────────────────────

export type Phase =
  | { kind: 'graphify-start'; repos: number }
  | { kind: 'graphify-repo-done'; repo: string; nodes: number; edges: number }
  | { kind: 'graphify-merged'; nodes: number; edges: number; httpRelations: number }
  | {
      kind: 'llm-call-start'
      adapter: string
      model: string
      strategy: 'parallel' | 'single'
      apiReference: boolean
      /** Char count of the compact graph passed to the LLM (rough token proxy:
       *  ~4 chars/token for English/code, ~3.5 for Spanish prose). */
      compactChars: number
      /** Estimated INPUT tokens summed across all LLM calls the run will fire
       *  (system + user). Includes skill block, schema block, and compact
       *  graph. Cache discounts are NOT subtracted — the number reflects what
       *  the model has to read, not what gets billed. */
      inputTokensEstimate: number
      /** Estimated OUTPUT tokens summed across all LLM calls (the JSON
       *  documentation the model will produce). */
      outputTokensEstimate: number
      /** Number of LLM calls the run will fire. 1 for single-strategy
       *  adapters; (1 + repos + 1) for parallel, minus any sections skipped
       *  via ai.sections. */
      callCount: number
      /** Rough wall-clock seconds the LLM phase is expected to take.
       *  Derived from output tokens / per-model throughput, with a small
       *  overhead constant. Single-mode runs serially; parallel-mode runs
       *  the sequential overview first and then everything else in
       *  parallel, so its ETA is much shorter than the sum of per-call
       *  ETAs. */
      estimatedSec: number
    }
  | { kind: 'llm-start' }
  | { kind: 'llm-progress'; elapsedSec: number }
  | { kind: 'llm-done'; elapsedSec: number }
  | { kind: 'write-start' }
  | { kind: 'done'; outputPath: string }
  | { kind: 'watch-change'; repo: string; path: string }

export type PhaseListener = (phase: Phase) => void
export type AdapterProgressListener = (event: AdapterProgress) => void

export class Orchestrator {
  private listener: PhaseListener = () => {}
  private progressListener: AdapterProgressListener | undefined

  constructor(
    private config: RepomapConfig,
    private adapter: AIAdapter
  ) {}

  onPhase(listener: PhaseListener): this {
    this.listener = listener
    return this
  }

  /** Subscribe to fine-grained progress from parallel adapters. The CLI uses
   *  this to drive a listr2 multi-spinner during the LLM phase. Single-call
   *  adapters never emit these events. */
  onAdapterProgress(listener: AdapterProgressListener): this {
    this.progressListener = listener
    return this
  }

  async generate(): Promise<void> {
    if (!(await isGraphifyAvailable())) {
      throw new Error(
        `'graphify' CLI not found on PATH.\n` +
        `Install with:  pipx install graphifyy   (or)   uv tool install graphifyy`
      )
    }

    this.listener({ kind: 'graphify-start', repos: this.config.repos.length })
    const graph = await this.buildCodeGraph()
    this.listener({
      kind: 'graphify-merged',
      nodes: graph.graphify.nodes.length,
      edges: graph.graphify.edges.length,
      httpRelations: graph.httpRelations.length,
    })

    debugDumpJson('code-graph.json', graph)

    const adapterName = this.adapter.constructor.name
      .replace(/Adapter$/, '')
      .toLowerCase()
    const strategy = this.config.ai.strategy ?? this.adapter.defaultStrategy ?? 'single'
    const estimate = estimateLlmUsage(graph, this.config, strategy)
    this.listener({
      kind: 'llm-call-start',
      adapter: adapterName,
      model: this.config.ai.model ?? 'default',
      strategy,
      apiReference: estimate.apiReference,
      compactChars: estimate.compactChars,
      inputTokensEstimate: estimate.inputTokens,
      outputTokensEstimate: estimate.outputTokens,
      callCount: estimate.callCount,
      estimatedSec: estimate.estimatedSec,
    })

    this.listener({ kind: 'llm-start' })
    const t0 = Date.now()
    const tickInterval = setInterval(() => {
      this.listener({ kind: 'llm-progress', elapsedSec: Math.round((Date.now() - t0) / 1000) })
    }, 1000)
    let docs: Documentation
    try {
      docs = await this.adapter.generateDocs(graph, this.config, {
        onProgress: this.progressListener,
      })
    } finally {
      clearInterval(tickInterval)
    }
    this.listener({ kind: 'llm-done', elapsedSec: Math.round((Date.now() - t0) / 1000) })

    this.listener({ kind: 'write-start' })
    await this.writeDocs(docs, graph)
    this.saveKnowledge({ graph, docs })
    this.listener({ kind: 'done', outputPath: path.resolve(this.config.output.path) })
  }

  /**
   * Regenerate the HTML/Markdown output from the cached knowledge.json,
   * without calling graphify or the LLM. Used for fast iteration on
   * presentation changes (CSS, templates, i18n) without spending tokens.
   */
  async render(): Promise<void> {
    const knowledge = this.loadKnowledge()
    if (!knowledge) {
      throw new Error(
        `No cached knowledge at ${path.resolve(this.config.output.path)}/data/knowledge.json.\n` +
        `Run 'repomap generate' at least once first.`
      )
    }
    this.listener({ kind: 'write-start' })
    await this.writeDocs(knowledge.docs, knowledge.graph)
    this.listener({ kind: 'done', outputPath: path.resolve(this.config.output.path) })
  }

  /**
   * Watch repos for changes and update docs incrementally.
   *
   * @param opts.ignore  Extra ignore patterns (chokidar globs or regexes),
   *                     appended to the built-in default (node_modules, .git,
   *                     dist, build, graphify-out).
   * @param opts.debounceMs  How long to wait after the last change before
   *                         running incrementalUpdate. Default 1500ms.
   *                         Lower for faster repos, higher for monorepos with
   *                         heavy save bursts (formatter-on-save, codegen).
   */
  async watch(opts?: { ignore?: string[]; debounceMs?: number }): Promise<void> {
    await this.generate()
    const repoPaths = this.config.repos.map((r) => path.resolve(r.path))
    const debounceMs = opts?.debounceMs ?? 1500
    const defaultIgnore = /(node_modules|\.git|dist|build|graphify-out)/
    const ignored = opts?.ignore && opts.ignore.length > 0
      ? [defaultIgnore, ...opts.ignore]
      : defaultIgnore
    const watcher = chokidar.watch(repoPaths, {
      ignored,
      persistent: true,
      ignoreInitial: true,
    })
    let timeout: NodeJS.Timeout | null = null
    let queued: string | null = null
    watcher.on('change', (changedPath) => {
      queued = changedPath
      if (timeout) clearTimeout(timeout)
      timeout = setTimeout(async () => {
        const cp = queued
        queued = null
        if (!cp) return
        const repoName = this.getRepoNameForPath(cp)
        const repoRoot = this.config.repos.find((r) => r.name === repoName)?.path ?? ''
        const rel = repoRoot ? path.relative(path.resolve(repoRoot), cp) : path.basename(cp)
        this.listener({ kind: 'watch-change', repo: repoName, path: rel || path.basename(cp) })
        await this.incrementalUpdate(repoName, cp)
      }, debounceMs)
    })
  }

  // ── Core ──────────────────────────────────────────────────────────────────

  private async buildCodeGraph(): Promise<CodeGraph> {
    const graphifyRoot = path.resolve(this.config.output.path, 'graphify')
    fs.mkdirSync(graphifyRoot, { recursive: true })

    const perRepo = await Promise.all(
      this.config.repos.map(async (repo) => {
        const [graphifyRes, summary] = await Promise.all([
          runGraphify(repo.path, repo.name, { outDirRoot: graphifyRoot, noViz: false }),
          buildRepoSummary(repo),
        ])
        for (const n of graphifyRes.graph.nodes) {
          if (!n.repo) n.repo = repo.name
        }
        this.listener({
          kind: 'graphify-repo-done',
          repo: repo.name,
          nodes: graphifyRes.graph.nodes.length,
          edges: graphifyRes.graph.edges.length,
        })
        return { graphifyRes, summary }
      })
    )

    const summaries: RepoSummary[] = perRepo.map((r) => r.summary)
    // Independent steps: mergeGraphifyGraphs reads per-repo graph.json + spawns
    // the graphify CLI for cross-repo edges; detectHttpCalls walks the source
    // files of each repo. Neither feeds into the other — fire in parallel.
    // readWorkspaceContext is sync, no benefit to awaiting.
    const [{ graph: merged }, httpRelations] = await Promise.all([
      mergeGraphifyGraphs(perRepo.map((r) => r.graphifyRes.graphJsonPath), graphifyRoot),
      detectHttpCalls(summaries),
    ])
    const workspace = readWorkspaceContext()

    return {
      repos: summaries,
      graphify: merged,
      httpRelations,
      workspace,
      generatedAt: new Date().toISOString(),
    }
  }

  // ── Incremental ───────────────────────────────────────────────────────────

  private async incrementalUpdate(repoName: string, changedPath: string): Promise<void> {
    const knowledge = this.loadKnowledge()
    if (!knowledge) return this.generate()

    try {
      const repoConfig = this.config.repos.find((r) => r.name === repoName)
      if (!repoConfig) return

      const graphifyRoot = path.resolve(this.config.output.path, 'graphify')
      await runGraphify(repoConfig.path, repoName, { outDirRoot: graphifyRoot })

      const git = simpleGit(repoConfig.path)
      const log = await git.log({ maxCount: 1 })
      const latestCommit = log.latest?.hash ?? 'unknown'
      const diffOutput = await git.diff(['HEAD~1', 'HEAD', '--', changedPath])

      const diff: GitDiff = {
        repo: repoName,
        commit: latestCommit,
        changedFiles: [{ path: changedPath, status: 'modified', diff: diffOutput }],
      }

      this.listener({ kind: 'llm-start' })
      const updatedDocs = await this.adapter.updateDocs(knowledge.docs, diff, this.config)
      updatedDocs.changelog = [
        {
          date: new Date().toISOString(),
          repo: repoName,
          commit: latestCommit,
          summary: `Updated due to changes in ${path.basename(changedPath)}`,
          affectedDocs: [repoName],
        },
        ...(updatedDocs.changelog ?? []),
      ].slice(0, 50)
      this.listener({ kind: 'llm-done', elapsedSec: 0 })

      await this.writeDocs(updatedDocs, knowledge.graph)
      this.saveKnowledge({ graph: knowledge.graph, docs: updatedDocs })
    } catch (err) {
      console.error('Incremental update failed, falling back to full generation:', err)
      await this.generate()
    }
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  private async writeDocs(docs: Documentation, graph: CodeGraph): Promise<void> {
    const outputPath = path.resolve(this.config.output.path)
    fs.mkdirSync(outputPath, { recursive: true })

    if (this.config.output.format === 'json') {
      fs.writeFileSync(
        path.join(outputPath, 'docs.json'),
        JSON.stringify({ docs, graph }, null, 2)
      )
      return
    }
    if (this.config.output.format === 'markdown') {
      generateMarkdown(docs, outputPath, this.config.language)
      return
    }
    generateHTML(docs, graph, outputPath, this.config.language)
  }

  private getRepoNameForPath(filePath: string): string {
    for (const repo of this.config.repos) {
      if (filePath.startsWith(path.resolve(repo.path))) return repo.name
    }
    return 'unknown'
  }

  private saveKnowledge(knowledge: { graph: CodeGraph; docs: Documentation }): void {
    const dataPath = path.join(path.resolve(this.config.output.path), 'data')
    fs.mkdirSync(dataPath, { recursive: true })
    fs.writeFileSync(
      path.join(dataPath, 'knowledge.json'),
      JSON.stringify(knowledge, null, 2)
    )
  }

  private loadKnowledge(): { graph: CodeGraph; docs: Documentation } | null {
    const p = path.join(path.resolve(this.config.output.path), 'data', 'knowledge.json')
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  }
}

// ── Workspace context (README + package.json at the cwd) ──────────────────

function readWorkspaceContext(): import('./types.js').WorkspaceContext | undefined {
  const cwd = process.cwd()
  const ctx: import('./types.js').WorkspaceContext = {}
  for (const name of ['README.md', 'README.es.md', 'README.en.md', 'README']) {
    const p = path.join(cwd, name)
    if (fs.existsSync(p)) {
      try {
        const text = fs.readFileSync(p, 'utf-8')
        ctx.readme = text.length > 3500 ? text.slice(0, 3500) + '\n\n…(truncated)' : text
        break
      } catch { /* skip */ }
    }
  }
  const meta = readPackageMeta(cwd)
  if (meta) ctx.rootPackageMeta = meta
  return ctx.readme || ctx.rootPackageMeta ? ctx : undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Token estimate for the upcoming run. Shown to the user before any LLM call
// fires so they have a sense of cost/wait. Approximate (~10-20% off) — the
// goal is "is this 5K, 50K, or 500K tokens", not exact billing.
//
// Includes ALL parts of every call: skill block (system), schema block
// (system), compact graph (user), per-call wrapper text. Sums across calls
// when the strategy is parallel. Cache discounts are NOT subtracted — the
// number reflects what the model has to read, not what gets billed at
// post-cache rates.
// ─────────────────────────────────────────────────────────────────────────────

interface LlmUsageEstimate {
  inputTokens: number
  outputTokens: number
  callCount: number
  compactChars: number   // kept for backward compat with the Phase event
  apiReference: boolean
  estimatedSec: number
}

// Output-token throughput by model family (tokens/sec). Calibrated against
// typical Anthropic latencies — intentionally conservative so the elapsed
// counter rarely overshoots the ETA.
function throughputTokPerSec(model: string | undefined): number {
  const m = (model ?? '').toLowerCase()
  if (m.includes('haiku')) return 120
  if (m.includes('opus')) return 35
  // sonnet, default, custom IDs we don't recognize → assume Sonnet-class
  return 60
}

// Per-call network/queue overhead. Small because cache reads are fast and
// claude-code/claude both warm up quickly.
const CALL_OVERHEAD_SEC = 4

// Schema block sizes (chars) — pulled from the adapter source. Constants
// keep this estimator decoupled from the adapter; if you change a schema,
// bump the matching number here.
const SCHEMA_CHARS = {
  legacySingle: 5300,
  leanSingle: 2100,
  legacyOverview: 730,
  leanOverview: 360,
  legacyService: 1080,
  leanService: 750,
  legacyGettingStarted: 1900,
  leanGettingStarted: 700,
  apiRefAddition: 1200, // extra chars when apiReference: true (single mode)
}

// Rough output budgets (tokens) per section. Calibrated against a 6-service
// monorepo run; small projects come in under, very large ones a bit over.
const OUTPUT_TOK = {
  overview: 600,
  integrations: 1100,
  serviceWithoutApiRef: 700,
  serviceWithApiRef: 1700,
  gettingStarted: 2400,
}

function tok(chars: number): number {
  return Math.round(chars / 4)
}

function estimateLlmUsage(
  graph: CodeGraph,
  config: RepomapConfig,
  strategy: 'single' | 'parallel'
): LlmUsageEstimate {
  const lean = !!config.ai.lean
  const sections = config.ai.sections ?? {}
  const apiReference = sections.apiReference ?? config.ai.apiReference ?? false
  const compactFull = compactForLLM(graph, { lean, budget: config.ai.budget })
  const compactChars = compactFull.length
  const baseSysChars = 280       // base instruction prefix
  const userWrapperChars = 200   // "Here is the structural analysis…" framing

  if (strategy === 'single') {
    const skill = loadDocsSkill({ lean })
    const skillChars = skill?.text.length ?? 0
    const schemaChars =
      (lean ? SCHEMA_CHARS.leanSingle : SCHEMA_CHARS.legacySingle) +
      (apiReference ? SCHEMA_CHARS.apiRefAddition : 0)
    const inputChars = baseSysChars + skillChars + schemaChars + compactChars + userWrapperChars
    const repoCount = graph.repos.length
    const wantOverview = sections.overview ?? true
    const wantIntegrations = sections.integrations ?? true
    const wantServices = sections.services ?? true
    const gs = sections.gettingStarted ?? 'auto'
    const wantGs = gs === true ? true : gs === false ? false : repoCount <= 8
    const svcOutPerRepo = apiReference ? OUTPUT_TOK.serviceWithApiRef : OUTPUT_TOK.serviceWithoutApiRef
    const outputTokens =
      (wantOverview ? OUTPUT_TOK.overview : 0) +
      (wantIntegrations ? OUTPUT_TOK.integrations : 0) +
      (wantServices ? svcOutPerRepo * repoCount : 0) +
      (wantGs ? OUTPUT_TOK.gettingStarted : 0)
    // Single mode: ETA is dominated by output streaming time at the primary
    // model's throughput, plus one overhead.
    const estimatedSec = Math.round(outputTokens / throughputTokPerSec(config.ai.model) + CALL_OVERHEAD_SEC)
    return { inputTokens: tok(inputChars), outputTokens, callCount: 1, compactChars, apiReference, estimatedSec }
  }

  // parallel — sum across overview + N service + gettingStarted, minus skips.
  const repoCount = graph.repos.length
  const wantOverview = (sections.overview ?? true) || (sections.integrations ?? true)
  const wantServices = sections.services ?? true
  const gs = sections.gettingStarted ?? 'auto'
  const wantGs = gs === true ? true : gs === false ? false : repoCount <= 8

  const ovSkill = loadDocsSkill({ sections: ['diataxis', 'diagrams', 'writing'], lean })
  const svcSkill = loadDocsSkill({ sections: ['templates', 'examples', 'writing'], lean })
  const gsSkill = loadDocsSkill({ sections: ['templates', 'writing'], lean })

  const ovSchema = lean ? SCHEMA_CHARS.leanOverview : SCHEMA_CHARS.legacyOverview
  const svcSchema = (lean ? SCHEMA_CHARS.leanService : SCHEMA_CHARS.legacyService) +
                    (apiReference ? SCHEMA_CHARS.apiRefAddition : 0)
  const gsSchema = lean ? SCHEMA_CHARS.leanGettingStarted : SCHEMA_CHARS.legacyGettingStarted

  const ovInput = baseSysChars + (ovSkill?.text.length ?? 0) + ovSchema + compactChars + userWrapperChars
  // Per-service: ~1/N of the compact graph (sliced to one repo).
  const svcUserChars = Math.round(compactChars / Math.max(repoCount, 1)) + userWrapperChars
  const svcInput = baseSysChars + (svcSkill?.text.length ?? 0) + svcSchema + svcUserChars
  const gsInput = baseSysChars + (gsSkill?.text.length ?? 0) + gsSchema + compactChars + userWrapperChars

  let inputChars = 0
  let outputTokens = 0
  let callCount = 0
  const primaryTp = throughputTokPerSec(config.ai.model)
  // modelFast defaults to 'haiku' on claude, primary elsewhere. Fall back to
  // the same throughput if no modelFast is configured.
  const fastTp = config.ai.modelFast
    ? throughputTokPerSec(config.ai.modelFast)
    : (config.ai.provider === 'claude' ? throughputTokPerSec('haiku') : primaryTp)

  // Sequential first call (overview + integrations) uses the primary model.
  let sequentialSec = 0
  // Parallel calls run concurrently — wall-clock = the SLOWEST of them.
  let parallelMaxSec = 0
  if (wantOverview) {
    inputChars += ovInput
    const ovOut = OUTPUT_TOK.overview + OUTPUT_TOK.integrations
    outputTokens += ovOut
    callCount += 1
    sequentialSec += ovOut / primaryTp + CALL_OVERHEAD_SEC
  }
  if (wantServices) {
    inputChars += repoCount * svcInput
    const svcOut = apiReference ? OUTPUT_TOK.serviceWithApiRef : OUTPUT_TOK.serviceWithoutApiRef
    outputTokens += repoCount * svcOut
    callCount += repoCount
    const svcSec = svcOut / fastTp + CALL_OVERHEAD_SEC
    if (svcSec > parallelMaxSec) parallelMaxSec = svcSec
  }
  if (wantGs) {
    inputChars += gsInput
    outputTokens += OUTPUT_TOK.gettingStarted
    callCount += 1
    const gsSec = OUTPUT_TOK.gettingStarted / fastTp + CALL_OVERHEAD_SEC
    if (gsSec > parallelMaxSec) parallelMaxSec = gsSec
  }

  const estimatedSec = Math.round(sequentialSec + parallelMaxSec)
  return { inputTokens: tok(inputChars), outputTokens, callCount, compactChars, apiReference, estimatedSec }
}
