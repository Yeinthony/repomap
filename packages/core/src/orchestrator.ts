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
} from './types.js'
import { runGraphify, mergeGraphifyGraphs, isGraphifyAvailable } from './graphify/runner.js'
import { buildRepoSummary, detectHttpCalls } from './detectors/index.js'
import { readPackageMeta } from './detectors/repo-summary.js'
import { generateHTML, generateMarkdown } from './render/html.js'
import { debugDumpJson } from './debug.js'

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
  | { kind: 'llm-start' }
  | { kind: 'llm-progress'; elapsedSec: number }
  | { kind: 'llm-done'; elapsedSec: number }
  | { kind: 'write-start' }
  | { kind: 'done'; outputPath: string }
  | { kind: 'watch-change'; repo: string; path: string }

export type PhaseListener = (phase: Phase) => void

export class Orchestrator {
  private listener: PhaseListener = () => {}

  constructor(
    private config: RepomapConfig,
    private adapter: AIAdapter
  ) {}

  onPhase(listener: PhaseListener): this {
    this.listener = listener
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

    this.listener({ kind: 'llm-start' })
    const t0 = Date.now()
    const tickInterval = setInterval(() => {
      this.listener({ kind: 'llm-progress', elapsedSec: Math.round((Date.now() - t0) / 1000) })
    }, 1000)
    let docs: Documentation
    try {
      docs = await this.adapter.generateDocs(graph, this.config)
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

  async watch(): Promise<void> {
    await this.generate()
    const repoPaths = this.config.repos.map((r) => path.resolve(r.path))
    const watcher = chokidar.watch(repoPaths, {
      ignored: /(node_modules|\.git|dist|build|graphify-out)/,
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
      }, 1500)
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
    const { graph: merged } = await mergeGraphifyGraphs(
      perRepo.map((r) => r.graphifyRes.graphJsonPath),
      graphifyRoot
    )

    const httpRelations = await detectHttpCalls(summaries)
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
