import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'
import type { HttpRelation, RepoSummary } from '../types.js'

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rb', '.java']
const IGNORE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/coverage/**']

interface RawHttpCall {
  fromRepo: string
  url: string                  // may contain `${VAR}` interpolation
  method?: string
  sourceFile: string
  envVarHint?: string          // captured env var name if URL was templated
}

/**
 * Scan each repo for HTTP-client calls (fetch, axios, requests, http.Get, etc.)
 * and resolve their target to another repo using:
 *   - literal URL host matching a docker service / env-var URL of another repo
 *   - env-var name matching a known SERVICE_URL declared in another repo's .env
 */
export async function detectHttpCalls(repos: RepoSummary[]): Promise<HttpRelation[]> {
  // First pass: collect raw HTTP calls per repo (in parallel).
  const allRaw: RawHttpCall[] = (
    await Promise.all(repos.map((r) => scanRepoForHttp(r.path, r.name)))
  ).flat()

  // Build lookup: hostHint → repo name, envVar → repo name
  const hostToRepo = new Map<string, string>()
  const envVarToRepo = new Map<string, string>()
  for (const repo of repos) {
    if (repo.dockerService) hostToRepo.set(repo.dockerService.toLowerCase(), repo.name)
    hostToRepo.set(repo.name.toLowerCase(), repo.name)
    for (const su of repo.serviceUrls) {
      // A mapping inside repo X that says PAYMENTS_SERVICE_URL=http://payments
      // does NOT mean X is payments — it means X talks TO payments. We only
      // index entries that announce THIS repo's own host (docker service mapping)
      if (su.envVar === '__docker_service__') {
        hostToRepo.set(su.hostHint.toLowerCase(), repo.name)
      }
    }
  }

  // Env-var convention: PAYMENTS_SERVICE_URL → payments
  for (const repo of repos) {
    const guesses = guessRepoFromEnvVar(repo.name)
    for (const g of guesses) envVarToRepo.set(g, repo.name)
  }

  // Resolve each raw call to a HttpRelation
  const relations: HttpRelation[] = []
  for (const call of allRaw) {
    const resolved = resolveTarget(call, hostToRepo, envVarToRepo)
    if (!resolved) continue
    if (resolved.to === call.fromRepo) continue  // self-call, ignore
    relations.push({
      from: call.fromRepo,
      to: resolved.to,
      url: call.url,
      method: call.method,
      sourceFile: call.sourceFile,
      evidence: resolved.evidence,
    })
  }

  return dedupeRelations(relations)
}

async function scanRepoForHttp(repoPath: string, repoName: string): Promise<RawHttpCall[]> {
  const files = await fg('**/*', {
    cwd: repoPath,
    ignore: IGNORE,
    onlyFiles: true,
    absolute: true,
  })

  const calls: RawHttpCall[] = []

  for (const file of files) {
    if (!CODE_EXTS.includes(path.extname(file))) continue
    let content: string
    try {
      content = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    const relFile = path.relative(repoPath, file)

    // ── fetch('url' …)  fetch(`http://…`)  fetch(`${X_SERVICE_URL}/…`) ──
    const fetchPattern = /\bfetch\s*\(\s*[`'"]([^`'"]+)[`'"]/g
    let m: RegExpExecArray | null
    while ((m = fetchPattern.exec(content)) !== null) {
      pushCall(calls, repoName, m[1], undefined, relFile)
    }

    // ── axios.METHOD('url' …)  /  axios({ method, url }) ──
    const axiosPattern = /\baxios\s*\.\s*(get|post|put|patch|delete|request)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi
    while ((m = axiosPattern.exec(content)) !== null) {
      pushCall(calls, repoName, m[2], m[1].toUpperCase(), relFile)
    }

    // ── http.get / https.request / got / ky ──
    const nodeHttpPattern = /\b(?:https?|got|ky)\s*\.\s*(get|post|put|patch|delete|request)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi
    while ((m = nodeHttpPattern.exec(content)) !== null) {
      pushCall(calls, repoName, m[2], m[1].toUpperCase(), relFile)
    }

    // ── Python requests.METHOD('url' …) ──
    const pyReqPattern = /\brequests\s*\.\s*(get|post|put|patch|delete|request)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi
    while ((m = pyReqPattern.exec(content)) !== null) {
      pushCall(calls, repoName, m[2], m[1].toUpperCase(), relFile)
    }

    // ── Python httpx ──
    const httpxPattern = /\bhttpx\s*\.\s*(get|post|put|patch|delete|request)\s*\(\s*[`'"]([^`'"]+)[`'"]/gi
    while ((m = httpxPattern.exec(content)) !== null) {
      pushCall(calls, repoName, m[2], m[1].toUpperCase(), relFile)
    }
  }

  return calls
}

function pushCall(
  out: RawHttpCall[],
  fromRepo: string,
  url: string,
  method: string | undefined,
  sourceFile: string
): void {
  // Capture env-var hint inside template strings  `${PAYMENTS_SERVICE_URL}/…`
  const tplMatch = url.match(/\$\{?([A-Z][A-Z0-9_]+)\}?/)
  const envVarHint = tplMatch?.[1]

  // Only keep calls that look outbound (http(s):// OR env-var-templated)
  if (!/^https?:\/\//.test(url) && !envVarHint) return

  out.push({ fromRepo, url, method, sourceFile, envVarHint })
}

function resolveTarget(
  call: RawHttpCall,
  hostToRepo: Map<string, string>,
  envVarToRepo: Map<string, string>
): { to: string; evidence: HttpRelation['evidence'] } | undefined {
  // 1. Env-var templated URL → match against known *_SERVICE_URL conventions
  if (call.envVarHint) {
    const direct = envVarToRepo.get(call.envVarHint)
    if (direct) return { to: direct, evidence: 'env-var-match' }
  }

  // 2. Literal URL — extract host, see if it matches a known repo/service
  if (/^https?:\/\//.test(call.url)) {
    let host: string
    try {
      host = new URL(call.url).hostname.toLowerCase()
    } catch {
      return undefined
    }
    const hit = hostToRepo.get(host)
    if (hit) {
      const evidence: HttpRelation['evidence'] =
        host === hit.toLowerCase() ? 'literal-url' : 'docker-service-match'
      return { to: hit, evidence }
    }
  }

  return undefined
}

function guessRepoFromEnvVar(repoName: string): string[] {
  const base = repoName.toUpperCase().replace(/[^A-Z0-9]/g, '_')
  return [
    `${base}_URL`,
    `${base}_SERVICE_URL`,
    `${base}_API_URL`,
    `${base}_HOST`,
    `${base}_BASE_URL`,
  ]
}

function dedupeRelations(rels: HttpRelation[]): HttpRelation[] {
  const seen = new Set<string>()
  const out: HttpRelation[] = []
  for (const r of rels) {
    const k = `${r.from}|${r.to}|${r.method ?? ''}|${r.url}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(r)
    }
  }
  return out
}
