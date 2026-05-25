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
// Aim: ~5-15% of the source code size; total ≈ 8-20K tokens.
// ─────────────────────────────────────────────────────────────────────────────

export function compactForLLM(graph: CodeGraph): string {
  const lines: string[] = []

  // ── 1. Workspace context ──
  if (graph.workspace?.readme || graph.workspace?.rootPackageMeta) {
    lines.push('=== WORKSPACE CONTEXT (ground truth from authors) ===')
    if (graph.workspace.rootPackageMeta) {
      const m = graph.workspace.rootPackageMeta
      if (m.name) lines.push(`Workspace name: ${m.name}`)
      if (m.description) lines.push(`Workspace description: ${m.description}`)
    }
    if (graph.workspace.readme) {
      lines.push('')
      lines.push('--- workspace README ---')
      lines.push(graph.workspace.readme)
      lines.push('--- end workspace README ---')
    }
    lines.push('')
  }

  // ── 2. System overview ──
  lines.push('=== SYSTEM OVERVIEW ===')
  lines.push(`Services analyzed: ${graph.repos.map((r) => r.name).join(', ')}`)
  lines.push('')

  // ── 3. Per-repo blocks ──
  for (const repo of graph.repos) {
    lines.push(`==================== ${repo.name} ====================`)
    lines.push(`Path: ${repo.path}`)
    lines.push(`Languages: ${repo.languages.join(', ') || 'unknown'}`)
    if (repo.dockerService) lines.push(`Docker service: ${repo.dockerService}`)

    // Package metadata — what the package declares about itself
    if (repo.packageMeta) {
      lines.push(...formatPackageMeta(repo.packageMeta))
    }

    // README — ground truth from the author
    if (repo.readme) {
      lines.push('')
      lines.push(`--- ${repo.name} README ---`)
      lines.push(repo.readme)
      lines.push(`--- end ${repo.name} README ---`)
    }

    // Static signals (endpoints, events, env, deps)
    if (repo.endpoints.length > 0) {
      const http = repo.endpoints.filter((e) => e.type === 'http').slice(0, 30)
      const events = repo.endpoints.filter((e) => e.type === 'event').slice(0, 20)
      if (http.length > 0) {
        lines.push('HTTP endpoints exposed:')
        for (const e of http) lines.push(`  ${e.method} ${e.path}${e.sourceFile ? '   (' + e.sourceFile + ')' : ''}`)
      }
      if (events.length > 0) {
        lines.push('Events emitted:')
        for (const e of events) lines.push(`  ${e.eventName}`)
      }
    }

    if (repo.serviceUrls.length > 0) {
      const realUrls = repo.serviceUrls.filter((su) => su.envVar !== '__docker_service__')
      if (realUrls.length > 0) {
        lines.push('Service URLs declared (env / compose):')
        for (const su of realUrls.slice(0, 15)) {
          lines.push(`  ${su.envVar} = ${su.url}`)
        }
      }
    }

    if (repo.dependencies.length > 0) {
      lines.push(`Top dependencies: ${repo.dependencies.slice(0, 15).join(', ')}`)
    }

    // Per-file symbol map from static TypeScript scan (capped to keep prompt lean)
    if (repo.exportedSymbols && repo.exportedSymbols.length > 0) {
      lines.push('Exported symbols (static scan, file → symbols):')
      for (const fe of repo.exportedSymbols.slice(0, 20)) {
        const symList = fe.symbols
          .slice(0, 8)
          .map((s) => `${s.async ? 'async ' : ''}${s.kind} ${s.name}`)
          .join(' | ')
        lines.push(`  ${fe.file}: ${symList}`)
      }
    }

    lines.push('')
  }

  // ── 4. Cross-repo HTTP connections (detected by repomap) ──
  if (graph.httpRelations.length > 0) {
    lines.push('=== HTTP CONNECTIONS BETWEEN SERVICES (detected by static scan) ===')
    for (const r of graph.httpRelations) {
      lines.push(`${r.from} → ${r.to} [${r.method ?? 'CALL'}] ${r.url}  (evidence: ${r.evidence})`)
    }
    lines.push('')
  }

  // ── 5. Cross-repo structural edges (from graphify) ──
  const crossRepoEdges = summarizeCrossRepoEdges(graph.graphify)
  if (crossRepoEdges.length > 0) {
    lines.push('=== STRUCTURAL CROSS-REPO EDGES (graphify) ===')
    for (const e of crossRepoEdges.slice(0, 50)) {
      lines.push(`${e.fromRepo}::${e.fromLabel} → ${e.toRepo}::${e.toLabel}  [${e.relation}]`)
    }
    lines.push('')
  }

  // ── 6. Communities ──
  const communities = (graph.graphify.graph?.communities ?? null) as Record<string, string[]> | null
  if (communities && Object.keys(communities).length > 0) {
    lines.push('=== COMMUNITIES (graphify clustering) ===')
    const top = Object.entries(communities).slice(0, 8)
    for (const [id, members] of top) {
      lines.push(`Community ${id}: ${members.slice(0, 6).join(', ')}${members.length > 6 ? ` (+${members.length - 6} more)` : ''}`)
    }
  }

  return lines.join('\n')
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
