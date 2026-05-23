import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import type { GraphifyGraph } from '../types.js'

// ─────────────────────────────────────────────────────────────────────────────
// GRAPHIFY RUNNER
// All artifacts (graph.json, GRAPH_REPORT.md, cache/) are written to a
// repomap-controlled directory, NEVER inside the analyzed repo. This keeps
// the user's repos clean (no graphify-out/ to .gitignore in every project).
//
// For code-only repos → pipeline.py with --out (Python, AST-only, no LLM).
// For repos with docs/papers/images → fallback to the /graphify Claude Code
// skill (which writes to <repo>/graphify-out/); we then move the result into
// repomap's output dir and delete the in-repo copy.
// ─────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PIPELINE_PY = path.join(__dirname, 'pipeline.py')

export interface GraphifyRunResult {
  repoName: string
  outDir: string
  graphJsonPath: string
  graphHtmlPath: string
  graph: GraphifyGraph
}

export interface RunGraphifyOpts {
  /** Root directory where per-repo subfolders will be created. Required
   *  to avoid writing inside the analyzed repo. */
  outDirRoot: string
  mode?: 'normal' | 'deep'
  noViz?: boolean
}

export async function isGraphifyAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('graphify', ['--help'], { stdio: 'ignore' })
    proc.on('error', () => resolve(false))
    proc.on('exit', (code) => resolve(code === 0))
  })
}

export async function runGraphify(
  repoPath: string,
  repoName: string,
  opts: RunGraphifyOpts
): Promise<GraphifyRunResult> {
  const absRepo = path.resolve(repoPath)
  if (!fs.existsSync(absRepo)) {
    throw new Error(`Repo path not found: ${absRepo}`)
  }

  const outDir = path.join(path.resolve(opts.outDirRoot), safeFolderName(repoName))
  fs.mkdirSync(outDir, { recursive: true })
  const graphJsonPath = path.join(outDir, 'graph.json')
  const graphHtmlPath = path.join(outDir, 'graph.html')

  const py = findGraphifyPython()
  if (!py) {
    throw new Error(
      `Could not locate graphify's Python interpreter. Install with:\n` +
      `  pipx install graphifyy   (or)   uv tool install graphifyy`
    )
  }

  const exitCode = await runProcessExit(py, [PIPELINE_PY, absRepo, '--out', outDir])

  if (exitCode === 2) {
    // Non-code files (docs/papers/images) — fall back to the /graphify skill.
    // The skill writes into <repo>/graphify-out/. We move it out afterwards
    // so the analyzed repo stays clean.
    const skillCmd = `/graphify ${absRepo}${opts.noViz ? ' --no-viz' : ''}${opts.mode === 'deep' ? ' --mode deep' : ''}`
    await runProcess('claude', [
      '-p',
      '--dangerously-skip-permissions',
      '--output-format', 'text',
      skillCmd,
    ])
    relocateSkillOutput(absRepo, outDir)
  } else if (exitCode !== 0) {
    throw new Error(`graphify pipeline.py exited with code ${exitCode} for ${repoName}`)
  }

  if (!fs.existsSync(graphJsonPath)) {
    throw new Error(`graphify finished but no graph.json at ${graphJsonPath}`)
  }

  const graph = normalizeGraph(JSON.parse(fs.readFileSync(graphJsonPath, 'utf-8')))
  return { repoName, outDir, graphJsonPath, graphHtmlPath, graph }
}

export async function mergeGraphifyGraphs(
  perRepoGraphPaths: string[],
  outDir: string
): Promise<{ mergedJsonPath: string; graph: GraphifyGraph }> {
  fs.mkdirSync(outDir, { recursive: true })
  const mergedJsonPath = path.join(outDir, 'cross-repo-graph.json')

  if (perRepoGraphPaths.length === 1) {
    fs.copyFileSync(perRepoGraphPaths[0], mergedJsonPath)
  } else {
    await runProcess('graphify', ['merge-graphs', ...perRepoGraphPaths, '--out', mergedJsonPath])
  }

  const graph = normalizeGraph(JSON.parse(fs.readFileSync(mergedJsonPath, 'utf-8')))
  return { mergedJsonPath, graph }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * If the /graphify skill ran, its artifacts are inside <repo>/graphify-out/.
 * Move them into our managed outDir and delete the in-repo copy.
 */
function relocateSkillOutput(repoPath: string, targetOutDir: string): void {
  const skillOut = path.join(repoPath, 'graphify-out')
  if (!fs.existsSync(skillOut)) return
  fs.mkdirSync(targetOutDir, { recursive: true })
  for (const entry of fs.readdirSync(skillOut, { withFileTypes: true })) {
    const src = path.join(skillOut, entry.name)
    const dst = path.join(targetOutDir, entry.name)
    try {
      fs.rmSync(dst, { recursive: true, force: true })
      fs.renameSync(src, dst)
    } catch {
      // Cross-device or other rename failure: fall back to copy + delete
      copyRecursive(src, dst)
      fs.rmSync(src, { recursive: true, force: true })
    }
  }
  try { fs.rmdirSync(skillOut) } catch { /* not empty or other — leave it */ }
}

function copyRecursive(src: string, dst: string): void {
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dst, entry))
    }
  } else {
    fs.copyFileSync(src, dst)
  }
}

function safeFolderName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[@]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'repo'
}

function normalizeGraph(raw: unknown): GraphifyGraph {
  const g = raw as Record<string, unknown>
  const nodes = (g.nodes ?? []) as GraphifyGraph['nodes']
  const edges = (g.edges ?? g.links ?? []) as GraphifyGraph['edges']
  const hyperedges = (g.hyperedges
    ?? (g.graph as Record<string, unknown> | undefined)?.hyperedges
    ?? []) as unknown[]
  return {
    nodes,
    edges,
    hyperedges,
    graph: (g.graph ?? {}) as Record<string, unknown>,
  }
}

function findGraphifyPython(): string | null {
  const which = spawnSync('which', ['graphify'], { env: { ...process.env, PATH: enrichedPath() } })
  const binPath = which.stdout?.toString().trim()
  if (binPath && fs.existsSync(binPath)) {
    try {
      const first = fs.readFileSync(binPath, 'utf-8').split('\n')[0]
      if (first.startsWith('#!')) {
        const py = first.slice(2).trim().split(/\s+/)[0]
        if (py && fs.existsSync(py) && verifyPython(py)) return py
      }
    } catch { /* try next */ }
  }

  const uvCheck = spawnSync(
    'uv', ['tool', 'run', 'graphifyy', 'python', '-c', 'import sys; print(sys.executable)'],
    { env: { ...process.env, PATH: enrichedPath() } }
  )
  if (uvCheck.status === 0) {
    const py = uvCheck.stdout?.toString().trim().split('\n').pop()
    if (py && fs.existsSync(py) && verifyPython(py)) return py
  }

  for (const candidate of ['python3', 'python']) {
    if (verifyPython(candidate)) return candidate
  }
  return null
}

function verifyPython(py: string): boolean {
  const r = spawnSync(py, ['-c', 'import graphify'], { env: { ...process.env, PATH: enrichedPath() } })
  return r.status === 0
}

function runProcess(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: enrichedPath() },
    })
    let stderr = ''
    proc.stderr?.on('data', (d) => { stderr += d.toString() })
    proc.stdout?.on('data', () => { /* swallow */ })
    proc.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error(
          `'${cmd}' not found on PATH. Install graphify first:\n` +
          `  pipx install graphifyy   (or)   uv tool install graphifyy`
        ))
      } else {
        reject(err)
      }
    })
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(
        `${cmd} ${args.slice(0, 4).join(' ')}… exited with code ${code}\n${stderr.slice(-500)}`
      ))
    })
  })
}

function runProcessExit(cmd: string, args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: enrichedPath() },
    })
    proc.stderr?.on('data', () => { /* swallow */ })
    proc.stdout?.on('data', () => { /* swallow */ })
    proc.on('error', reject)
    proc.on('exit', (code) => resolve(code ?? 1))
  })
}

function enrichedPath(): string {
  const home = os.homedir()
  const extras = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.cargo', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]
  const current = (process.env.PATH ?? '').split(path.delimiter)
  const merged = [...current, ...extras.filter((p) => !current.includes(p))]
  return merged.join(path.delimiter)
}
