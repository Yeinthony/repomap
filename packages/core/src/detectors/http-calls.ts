import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'
import type { HttpRelation, RepoSummary, ServiceUrlMapping } from '../types.js'

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rb', '.java']
const IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
  '**/target/**',
  '**/src/test/**',
]

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
    await Promise.all(repos.map((r) => scanRepoForHttp(r.path, r.name, r.serviceUrls ?? [])))
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

async function scanRepoForHttp(
  repoPath: string,
  repoName: string,
  serviceUrls: ServiceUrlMapping[]
): Promise<RawHttpCall[]> {
  const files = await fg('**/*', {
    cwd: repoPath,
    ignore: IGNORE,
    onlyFiles: true,
    absolute: true,
  })

  // Build propertyPath → envVar from this repo's Spring config. Used by the
  // Java detectors below to resolve @Value("${path}") → ENV_VAR_NAME.
  const propPathToEnvVar = new Map<string, string>()
  for (const su of serviceUrls) {
    if (su.propertyPath) propPathToEnvVar.set(su.propertyPath, su.envVar)
  }

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

    // ── Java / Spring: RestTemplate, WebClient, Feign, OkHttp, Apache HttpClient ──
    if (path.extname(file) === '.java') {
      // Pre-pass over the file: build varName → envVar by tracing the
      // @Value chain: @Value-bound field/param  →  field assignments  →
      // local URL concatenations. The reference pattern in Spring is:
      //
      //   @Value("${core-catalog.base-url}") String externalServiceBaseUrl
      //   baseUrl = externalServiceBaseUrl
      //   String url = baseUrl + uri
      //   restTemplate.exchange(url, …)
      //
      // We chase those four hops so the final `restTemplate.exchange(url, …)`
      // emits a RawHttpCall with envVarHint = CATALOG_CORE_SERVICE_URL.
      const varToEnvVar = buildJavaUrlVarMap(content, propPathToEnvVar)
      const before = calls.length
      scanRestTemplate(content, repoName, relFile, varToEnvVar, calls)
      scanWebClient(content, repoName, relFile, varToEnvVar, calls)
      scanFeignClient(content, repoName, relFile, propPathToEnvVar, calls)
      scanOkHttpAndApache(content, repoName, relFile, varToEnvVar, calls)
      const hadPreciseEmits = calls.length > before

      // Fallback: when the file does have an HTTP client invocation but
      // toggles between URL bases at runtime (e.g. `if (x) url = otherBase
      // + uri`), regex can't follow the branch. If multiple @Value URL
      // bases were declared and one didn't surface as a precise emit, we
      // emit one synthetic call per missing base so the file is fully
      // attributed.
      if (hadPreciseEmits) {
        const emittedEnvVars = new Set(
          calls.slice(before).map((c) => c.envVarHint).filter(Boolean) as string[]
        )
        const allBases = new Set(varToEnvVar.values())
        for (const envVar of allBases) {
          if (!emittedEnvVars.has(envVar)) {
            calls.push({
              fromRepo: repoName,
              url: `\${${envVar}}`,
              method: undefined,
              sourceFile: relFile,
              envVarHint: envVar,
            })
          }
        }
      }
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

// ── Java / Spring helpers ────────────────────────────────────────────────────

/**
 * Trace `@Value("${path}")` annotations through field assignments and local
 * URL concatenations within a single Java file, producing a varName → envVar
 * lookup. Multi-pass to handle short transitive chains:
 *   @Value("${X}") String paramA   →  field = paramA   →  String url = field + uri
 * Three passes is enough for every Spring controller / service I've seen in
 * the wild; the loop bails early when nothing new gets added.
 */
function buildJavaUrlVarMap(
  content: string,
  propPathToEnvVar: Map<string, string>
): Map<string, string> {
  const map = new Map<string, string>()
  let m: RegExpExecArray | null

  // Step 1 — direct @Value annotations on a String/URL/URI declaration.
  // The annotation can be on a field declaration OR on a constructor parameter.
  const valueAnnot = /@Value\s*\(\s*"\$\{([^}:]+)(?::[^}]*)?\}"\s*\)\s*(?:(?:private|public|protected|final|static|synchronized|@\w+(?:\([^)]*\))?)\s+)*(?:String|URL|URI|CharSequence)\s+(\w+)/g
  while ((m = valueAnnot.exec(content)) !== null) {
    const propPath = m[1].trim()
    const varName = m[2]
    const envVar = propPathToEnvVar.get(propPath)
    if (envVar) map.set(varName, envVar)
  }

  if (map.size === 0) return map

  // Step 2 + 3 — chase assignments and concatenations. Up to 4 passes for
  // chains; almost always converges in 1-2.
  for (let pass = 0; pass < 4; pass++) {
    const sizeBefore = map.size

    // Field/var assignment: `this.foo = bar;`, `foo = bar;`, or the
    // fully-qualified static-field form `ClassName.foo = bar;` (Spring
    // constructors that bind to a static field). LHS and RHS can both carry
    // a `this.` / `ClassName.` prefix.
    const assignment = /(?:(?:this|[A-Z]\w*)\.)?(\w+)\s*=\s*(?:(?:this|[A-Z]\w*)\.)?(\w+)\s*;/g
    while ((m = assignment.exec(content)) !== null) {
      const lhs = m[1]
      const rhs = m[2]
      if (map.has(rhs) && !map.has(lhs)) map.set(lhs, map.get(rhs) as string)
    }

    // Local URL build: `String url = baseUrl + uri;` — RHS may carry a
    // `ClassName.` qualifier (`String url = MapperExternalService.foo + uri;`).
    const concat = /\b(?:String|URL|URI|CharSequence)\s+(\w+)\s*=\s*(?:(?:this|[A-Z]\w*)\.)?(\w+)\s*\+/g
    while ((m = concat.exec(content)) !== null) {
      const lhs = m[1]
      const rhs = m[2]
      if (map.has(rhs) && !map.has(lhs)) map.set(lhs, map.get(rhs) as string)
    }

    if (map.size === sizeBefore) break
  }

  return map
}

/**
 * `restTemplate.exchange(url, method, …)` and friends. We capture the first
 * argument and resolve it via the varToEnvVar map.
 *   - `getForObject` / `postForObject` / `getForEntity` / `postForEntity` carry
 *     their HTTP verb in the method name.
 *   - `exchange` / `execute` receive the HTTP method as a separate arg
 *     (HttpMethod.POST etc.); we capture the verb from the 2nd arg as a
 *     best-effort.
 */
function scanRestTemplate(
  content: string,
  fromRepo: string,
  sourceFile: string,
  varToEnvVar: Map<string, string>,
  out: RawHttpCall[]
): void {
  const rtPattern = /\b(?:\w+\s*\.\s*)?restTemplate\s*\.\s*(exchange|execute|getForObject|getForEntity|postForObject|postForEntity|put|delete|patchForObject|patchForEntity)\s*\(\s*([^,)]+?)\s*([,)])/gi
  let m: RegExpExecArray | null
  while ((m = rtPattern.exec(content)) !== null) {
    const rtMethod = m[1]
    const rawFirstArg = m[2]
    const httpMethod = inferRestTemplateMethod(rtMethod, content, m.index + m[0].length)
    pushJavaUrlArg(rawFirstArg, fromRepo, sourceFile, httpMethod, varToEnvVar, out)
  }
}

/**
 * For `exchange` / `execute`, look at the 2nd arg for `HttpMethod.GET` etc.
 * Scans a short window after the first arg's comma.
 */
function inferRestTemplateMethod(
  rtMethod: string,
  content: string,
  searchStart: number
): string | undefined {
  const lower = rtMethod.toLowerCase()
  if (lower.startsWith('get')) return 'GET'
  if (lower.startsWith('post')) return 'POST'
  if (lower.startsWith('put') && rtMethod === 'put') return 'PUT'
  if (lower.startsWith('patch')) return 'PATCH'
  if (lower.startsWith('delete') && rtMethod === 'delete') return 'DELETE'
  if (lower === 'exchange' || lower === 'execute') {
    // Look ahead ~200 chars for HttpMethod.X or method var named `method`
    const window = content.slice(searchStart, searchStart + 200)
    const direct = window.match(/HttpMethod\s*\.\s*([A-Z]+)/)
    if (direct) return direct[1]
  }
  return undefined
}

/**
 * Spring 5+ reactive client. We capture two forms:
 *   - `WebClient.create("http://x")` and `WebClient.create(baseUrlVar)`
 *   - `.uri("https://full-url/…")` chained off any builder (fallback for
 *     ad-hoc calls where the base is set elsewhere).
 * We don't attempt to follow the builder chain to combine base + path; that
 * needs real AST parsing.
 */
function scanWebClient(
  content: string,
  fromRepo: string,
  sourceFile: string,
  varToEnvVar: Map<string, string>,
  out: RawHttpCall[]
): void {
  const createPattern = /\bWebClient\s*\.\s*(?:create|builder\s*\(\s*\)\s*\.\s*baseUrl)\s*\(\s*([^)]+?)\s*\)/g
  let m: RegExpExecArray | null
  while ((m = createPattern.exec(content)) !== null) {
    pushJavaUrlArg(m[1], fromRepo, sourceFile, undefined, varToEnvVar, out)
  }

  // .uri("https://…") with a fully-qualified URL literal
  const uriLiteral = /\.uri\s*\(\s*"(https?:\/\/[^"]+)"\s*\)/g
  while ((m = uriLiteral.exec(content)) !== null) {
    pushCall(out, fromRepo, m[1], undefined, sourceFile)
  }
}

/**
 * `@FeignClient(name = "x", url = "${prop}")` — annotation-based HTTP client.
 * Resolves a `${prop}` URL via this repo's Spring config; falls through to a
 * direct env-var hint when the template references an ALL_CAPS var, and to a
 * raw literal URL otherwise.
 */
function scanFeignClient(
  content: string,
  fromRepo: string,
  sourceFile: string,
  propPathToEnvVar: Map<string, string>,
  out: RawHttpCall[]
): void {
  const feignPattern = /@FeignClient\s*\(\s*([^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = feignPattern.exec(content)) !== null) {
    const args = m[1]
    const urlMatch = args.match(/url\s*=\s*"([^"]+)"/)
    if (!urlMatch) continue
    const url = urlMatch[1]

    const propMatch = url.match(/^\s*\$\{([^}:]+)(?::[^}]*)?\}\s*$/)
    if (propMatch) {
      const envVar = propPathToEnvVar.get(propMatch[1].trim())
      if (envVar) {
        out.push({
          fromRepo,
          url: `\${${envVar}}`,
          method: undefined,
          sourceFile,
          envVarHint: envVar,
        })
        continue
      }
      // Fallback: the template might already reference an ALL_CAPS env var.
      pushCall(out, fromRepo, url, undefined, sourceFile)
      continue
    }
    if (/^https?:\/\//.test(url)) {
      pushCall(out, fromRepo, url, undefined, sourceFile)
    }
  }
}

/**
 * OkHttp `new Request.Builder().url(...)` and Apache HttpClient
 * `new HttpGet/HttpPost/...("...")`.
 */
function scanOkHttpAndApache(
  content: string,
  fromRepo: string,
  sourceFile: string,
  varToEnvVar: Map<string, string>,
  out: RawHttpCall[]
): void {
  // OkHttp builder chain — allow up to ~300 chars of fluent chaining between
  // Builder() and .url(...)
  const okhttpPattern = /\bnew\s+Request\s*\.\s*Builder\s*\(\s*\)[\s\S]{0,300}?\.url\s*\(\s*([^)]+?)\s*\)/g
  let m: RegExpExecArray | null
  while ((m = okhttpPattern.exec(content)) !== null) {
    pushJavaUrlArg(m[1], fromRepo, sourceFile, undefined, varToEnvVar, out)
  }

  // Apache HttpClient: classic API
  const apachePattern = /\bnew\s+(HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch|HttpHead)\s*\(\s*([^)]+?)\s*\)/g
  while ((m = apachePattern.exec(content)) !== null) {
    const method = m[1].replace(/^Http/, '').toUpperCase()
    pushJavaUrlArg(m[2], fromRepo, sourceFile, method, varToEnvVar, out)
  }
}

/**
 * Common entry point for Java URL-arg resolution. Handles three shapes:
 *   1. `"http://literal"` or `"${VAR}/path"`  → falls through to pushCall
 *   2. bare identifier `url`                  → resolve via varToEnvVar
 *   3. concatenation `baseUrl + uri`          → resolve `baseUrl`, mark suffix
 * Drops anything else (method calls, ternaries, lambdas) — we'd need AST
 * to do better.
 */
function pushJavaUrlArg(
  arg: string,
  fromRepo: string,
  sourceFile: string,
  method: string | undefined,
  varToEnvVar: Map<string, string>,
  out: RawHttpCall[]
): void {
  // Drop wrapping `new URI(…)` / `URI.create(…)`
  let cleaned = arg.trim()
  cleaned = cleaned.replace(/^new\s+URI\s*\(\s*/, '').replace(/^URI\s*\.\s*create\s*\(\s*/, '')
  cleaned = cleaned.replace(/\)\s*$/, '')
  cleaned = cleaned.trim()

  // 1. Literal string
  const lit = cleaned.match(/^"([^"]+)"$/)
  if (lit) {
    pushCall(out, fromRepo, lit[1], method, sourceFile)
    return
  }

  // 2. Identifier (with optional concatenation)
  const ident = cleaned.match(/^(\w+)/)
  if (!ident) return
  const varName = ident[1]
  const envVar = varToEnvVar.get(varName)
  if (!envVar) return

  const hasConcat = /\+/.test(cleaned)
  const url = hasConcat ? `\${${envVar}}/…` : `\${${envVar}}`
  out.push({
    fromRepo,
    url,
    method,
    sourceFile,
    envVarHint: envVar,
  })
}
