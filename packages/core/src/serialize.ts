import type { CodeGraph, GraphifyGraph, PackageMeta, RepoSummary } from './types.js'

// ─────────────────────────────────────────────────────────────────────────────
// Compact a CodeGraph into a token-efficient text representation for the LLM.
// Layered priority (decreasing trust, increasing inferability):
//   1. WORKSPACE CONTEXT   — root README + root package.json (the author's
//      stated description of the whole system).
//   2. PER-REPO TRUTH      — each repo's README + package.json metadata.
//      This is the most reliable description of WHAT THE REPO IS.
//   3. STATIC SIGNALS      — endpoints, env, deps, docker service.
//   4. STRUCTURAL DERIVATIVES — top concepts, cross-repo HTTP, cross-repo
//      structural edges, communities. Useful but more prone to misreading.
// Aim: ~5-15% of the source code size; total ≈ 8-20K tokens (legacy) or
// ≈ 4-8K tokens (lean).
// ─────────────────────────────────────────────────────────────────────────────

export interface CompactForLLMOpts {
  /** Approximate token budget. Hard caps shrink, low-priority blocks drop
   *  when the running estimate exceeds the budget. */
  budget?: number
  /** When true, applies aggressive caps (fewer files/symbols/edges) on top
   *  of the budget — same content shape, less of it. */
  lean?: boolean
}

interface Caps {
  endpointsHttp: number
  endpointsEvent: number
  serviceUrls: number
  dependencies: number
  files: number
  symbolsPerFile: number
  membersPerSymbol: number
  crossRepoEdges: number
  communities: number
  readmeChars: number
}

const LEGACY_CAPS: Caps = {
  endpointsHttp: 30,
  endpointsEvent: 20,
  serviceUrls: 15,
  dependencies: 15,
  files: 25,
  symbolsPerFile: 8,
  membersPerSymbol: 8,
  crossRepoEdges: 50,
  communities: 8,
  readmeChars: Infinity,
}

const LEAN_CAPS: Caps = {
  endpointsHttp: 20,
  endpointsEvent: 12,
  serviceUrls: 10,
  dependencies: 10,
  files: 12,
  symbolsPerFile: 5,
  membersPerSymbol: 5,
  crossRepoEdges: 20,
  communities: 4,
  readmeChars: 1500,
}

// Rough proxy: ~4 chars per token. Used only to enforce the soft budget.
const TOKENS_PER_CHAR = 0.25

export function compactForLLM(graph: CodeGraph, opts: CompactForLLMOpts = {}): string {
  const lean = !!opts.lean
  const caps = lean ? LEAN_CAPS : LEGACY_CAPS
  const budget = opts.budget ?? (lean ? 8000 : 20000)
  const charBudget = Math.round(budget / TOKENS_PER_CHAR)
  const lines: string[] = []
  let charsUsed = 0

  const remaining = (): number => charBudget - charsUsed
  const push = (line: string): boolean => {
    // Always allow short structural lines through to avoid producing a
    // headless block; otherwise stop when we're past the budget.
    if (charsUsed + line.length > charBudget && lines.length > 0 && line.length > 80) return false
    lines.push(line)
    charsUsed += line.length + 1
    return true
  }
  const pushAll = (xs: string[]): boolean => {
    for (const x of xs) if (!push(x)) return false
    return true
  }
  const overBudget = (): boolean => charsUsed >= charBudget

  // ── 1. Workspace context (always — it's the cheapest, highest-trust block) ──
  if (graph.workspace?.readme || graph.workspace?.rootPackageMeta) {
    push('=== WORKSPACE CONTEXT (ground truth from authors) ===')
    if (graph.workspace.rootPackageMeta) {
      const m = graph.workspace.rootPackageMeta
      if (m.name) push(`Workspace name: ${m.name}`)
      if (m.description) push(`Workspace description: ${m.description}`)
    }
    if (graph.workspace.readme) {
      const readme = capChars(graph.workspace.readme, caps.readmeChars)
      push('')
      push('--- workspace README ---')
      push(readme)
      push('--- end workspace README ---')
    }
    push('')
  }

  // ── 2. System overview ──
  push('=== SYSTEM OVERVIEW ===')
  push(`Services analyzed: ${graph.repos.map((r) => r.name).join(', ')}`)
  push('')

  // ── 3. Per-repo blocks ──
  // Symbol-ranking helper: prefer symbols that back an HTTP endpoint or have
  // a framework stereotype (`@RestController`, etc.) — they're the most
  // load-bearing parts of the API surface.
  for (const repo of graph.repos) {
    if (overBudget()) break
    const endpointFiles = new Set(
      repo.endpoints.map((e) => e.sourceFile).filter((f): f is string => !!f)
    )
    push(`==================== ${repo.name} ====================`)
    push(`Path: ${repo.path}`)
    push(`Languages: ${repo.languages.join(', ') || 'unknown'}`)
    if (repo.dockerService) push(`Docker service: ${repo.dockerService}`)

    if (repo.packageMeta) {
      pushAll(formatPackageMeta(repo.packageMeta))
    }

    if (repo.readme) {
      push('')
      push(`--- ${repo.name} README ---`)
      push(capChars(repo.readme, caps.readmeChars))
      push(`--- end ${repo.name} README ---`)
    }

    if (repo.endpoints.length > 0) {
      const http = repo.endpoints.filter((e) => e.type === 'http').slice(0, caps.endpointsHttp)
      const events = repo.endpoints.filter((e) => e.type === 'event').slice(0, caps.endpointsEvent)
      if (http.length > 0) {
        push('HTTP endpoints exposed:')
        for (const e of http) push(`  ${e.method} ${e.path}${e.sourceFile ? '   (' + e.sourceFile + ')' : ''}`)
      }
      if (events.length > 0) {
        push('Events emitted:')
        for (const e of events) push(`  ${e.eventName}`)
      }
    }

    if (repo.serviceUrls.length > 0) {
      const realUrls = repo.serviceUrls.filter((su) => su.envVar !== '__docker_service__')
      if (realUrls.length > 0) {
        push('Service URLs declared (env / compose):')
        for (const su of realUrls.slice(0, caps.serviceUrls)) {
          push(`  ${su.envVar} = ${su.url}`)
        }
      }
    }

    if (repo.dependencies.length > 0) {
      push(`Top dependencies: ${repo.dependencies.slice(0, caps.dependencies).join(', ')}`)
    }

    if (repo.exportedSymbols && repo.exportedSymbols.length > 0 && remaining() > 200) {
      // Rank files: those backing an endpoint first, then by symbol count.
      const ranked = [...repo.exportedSymbols].sort((a, b) => {
        const aHit = endpointFiles.has(a.file) ? 1 : 0
        const bHit = endpointFiles.has(b.file) ? 1 : 0
        if (aHit !== bHit) return bHit - aHit
        return (b.symbols?.length ?? 0) - (a.symbols?.length ?? 0)
      })
      push('Exported symbols (static scan, file → symbols):')
      for (const fe of ranked.slice(0, caps.files)) {
        // Within a file: tagged symbols (controllers, services) first.
        const sortedSyms = [...fe.symbols].sort((a, b) => (b.tag ? 1 : 0) - (a.tag ? 1 : 0))
        const symList = sortedSyms
          .slice(0, caps.symbolsPerFile)
          .map((s) => {
            const tag = s.tag ? `${s.tag} ` : ''
            const asyncPrefix = s.async ? 'async ' : ''
            const members =
              s.members && s.members.length > 0
                ? ` [${s.members.slice(0, caps.membersPerSymbol).join(', ')}${s.members.length > caps.membersPerSymbol ? ', …' : ''}]`
                : ''
            return `${tag}${asyncPrefix}${s.kind} ${s.name}${members}`
          })
          .join(' | ')
        push(`  ${fe.file}: ${symList}`)
      }
    }

    push('')
  }

  // ── 4. Cross-repo HTTP connections (detected by repomap) ──
  if (graph.httpRelations.length > 0 && remaining() > 200) {
    push('=== HTTP CONNECTIONS BETWEEN SERVICES (detected by static scan) ===')
    for (const r of graph.httpRelations) {
      push(`${r.from} → ${r.to} [${r.method ?? 'CALL'}] ${r.url}  (evidence: ${r.evidence})`)
    }
    push('')
  }

  // ── 5. Cross-repo structural edges (from graphify) ──
  // Lower priority than HTTP relations; skip when budget is tight.
  if (remaining() > 400) {
    const crossRepoEdges = summarizeCrossRepoEdges(graph.graphify)
    if (crossRepoEdges.length > 0) {
      push('=== STRUCTURAL CROSS-REPO EDGES (graphify) ===')
      for (const e of crossRepoEdges.slice(0, caps.crossRepoEdges)) {
        push(`${e.fromRepo}::${e.fromLabel} → ${e.toRepo}::${e.toLabel}  [${e.relation}]`)
      }
      push('')
    }
  }

  // ── 6. Communities (lowest priority) ──
  if (remaining() > 200) {
    const communities = (graph.graphify.graph?.communities ?? null) as Record<string, string[]> | null
    if (communities && Object.keys(communities).length > 0) {
      push('=== COMMUNITIES (graphify clustering) ===')
      const top = Object.entries(communities).slice(0, caps.communities)
      for (const [id, members] of top) {
        push(`Community ${id}: ${members.slice(0, 6).join(', ')}${members.length > 6 ? ` (+${members.length - 6} more)` : ''}`)
      }
    }
  }

  return lines.join('\n')
}

function capChars(s: string, max: number): string {
  if (!Number.isFinite(max) || s.length <= max) return s
  return s.slice(0, max).trimEnd() + '\n…(truncated)…'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPackageMeta(m: PackageMeta): string[] {
  const out: string[] = []
  if (m.name) out.push(`Package name: ${m.name}`)
  if (m.description) out.push(`Package description: ${m.description}`)
  if (m.main) out.push(`Entry point (main): ${m.main}`)
  if (m.bin) {
    if (typeof m.bin === 'string') out.push(`CLI bin: ${m.bin}`)
    else {
      const entries = Object.entries(m.bin)
      if (entries.length > 0) out.push(`CLI bin: ${entries.map(([k, v]) => `${k} → ${v}`).join(', ')}`)
    }
  }
  if (m.scripts) {
    const interesting = Object.entries(m.scripts)
      .filter(([k]) => !['preinstall', 'postinstall', 'prepare'].includes(k))
      .slice(0, 8)
    if (interesting.length > 0) {
      out.push('Scripts (npm run …):')
      for (const [k, v] of interesting) out.push(`  ${k}: ${v}`)
    }
  }
  if (m.keywords && m.keywords.length > 0) out.push(`Keywords: ${m.keywords.join(', ')}`)
  return out
}

interface FileSymbol {
  label: string
  callerCount: number
  calls: string[]
}

function buildFileSymbolMap(g: GraphifyGraph, repoName: string): Map<string, FileSymbol[]> {
  const indegree = new Map<string, number>()
  for (const e of g.edges) {
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
  }
  const nodeById = new Map(g.nodes.map((n) => [n.id, n]))
  const outgoing = new Map<string, string[]>()
  for (const e of g.edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, [])
    const t = nodeById.get(e.target)
    if (t?.label) outgoing.get(e.source)!.push(t.label)
  }

  const byFile = new Map<string, FileSymbol[]>()
  for (const n of g.nodes) {
    if (!n.source_file) continue
    if (n.file_type !== 'code') continue
    if (repoName && n.repo && n.repo !== repoName) continue
    if (!byFile.has(n.source_file)) byFile.set(n.source_file, [])
    byFile.get(n.source_file)!.push({
      label: n.label || n.id,
      callerCount: indegree.get(n.id) ?? 0,
      calls: outgoing.get(n.id) ?? [],
    })
  }

  for (const syms of byFile.values()) {
    syms.sort((a, b) => b.callerCount - a.callerCount)
  }

  // Keep top 15 files ranked by total caller weight
  const ranked = [...byFile.entries()]
    .sort((a, b) => {
      const score = (list: FileSymbol[]) => list.reduce((s, sym) => s + sym.callerCount + 1, 0)
      return score(b[1]) - score(a[1])
    })
    .slice(0, 15)

  return new Map(ranked)
}

function summarizeRepoNodes(g: GraphifyGraph, repoName: string): string[] {
  const indegree = new Map<string, number>()
  for (const e of g.edges) {
    indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
  }
  return g.nodes
    .filter((n) => !repoName || n.repo === repoName || n.repo === undefined)
    .sort((a, b) => (indegree.get(b.id) ?? 0) - (indegree.get(a.id) ?? 0))
    .map((n) => n.label || n.id)
    .filter(Boolean)
}

function summarizeCrossRepoEdges(g: GraphifyGraph): Array<{
  fromRepo: string
  fromLabel: string
  toRepo: string
  toLabel: string
  relation: string
}> {
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const out: Array<{ fromRepo: string; fromLabel: string; toRepo: string; toLabel: string; relation: string }> = []
  for (const e of g.edges) {
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (!s || !t) continue
    if (!s.repo || !t.repo) continue
    if (s.repo === t.repo) continue
    out.push({
      fromRepo: s.repo,
      fromLabel: s.label || s.id,
      toRepo: t.repo,
      toLabel: t.label || t.id,
      relation: e.relation,
    })
  }
  return out
}
