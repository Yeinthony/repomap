import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'
import yaml from 'yaml'
import type { ServiceUrlMapping } from '../types.js'

/**
 * Extract service-URL mappings from a repo:
 *   1. Any `.env*` file → VAR=URL pairs whose value looks like an HTTP URL
 *   2. docker-compose.yml `environment:` blocks
 *   3. docker-compose.yml `services:` (the service names themselves — used
 *      to resolve internal references like `http://payments:3000`)
 *   4. Spring `application*.{yml,yaml,properties}` and `bootstrap*` — any key
 *      ending in url/host/endpoint/uri whose value is `${ENV_VAR}` (with
 *      optional `:default`). Lets `@Value("${path.to.key}")` resolve back to
 *      an env var name during HTTP-call detection in Java code.
 *
 * Returns the mappings AND the docker service name for this repo (if any).
 */
export function detectServiceUrls(repoPath: string): {
  mappings: ServiceUrlMapping[]
  dockerServiceName?: string
} {
  const mappings: ServiceUrlMapping[] = []

  // ── .env files ────────────────────────────────────────────────────────────
  for (const envName of ['.env', '.env.example', '.env.local', '.env.development', '.env.sample']) {
    const envPath = path.join(repoPath, envName)
    if (!fs.existsSync(envPath)) continue
    const text = fs.readFileSync(envPath, 'utf-8')
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const m = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*=\s*['"]?(https?:\/\/[^'"\s]+)['"]?\s*$/)
      if (m) {
        mappings.push({
          envVar: m[1],
          url: m[2],
          hostHint: extractHost(m[2]),
          sourceFile: envName,
        })
      }
    }
  }

  // ── docker-compose.yml ────────────────────────────────────────────────────
  let dockerServiceName: string | undefined
  for (const dcName of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
    const dcPath = path.join(repoPath, dcName)
    if (!fs.existsSync(dcPath)) continue
    try {
      const doc = yaml.parse(fs.readFileSync(dcPath, 'utf-8')) as
        | { services?: Record<string, { environment?: unknown; container_name?: string }> }
        | undefined
      const services = doc?.services ?? {}
      const serviceNames = Object.keys(services)

      // Guess which service in this compose is "us" — best effort heuristic:
      // pick the first one whose context/build matches `.` or this dir's basename
      dockerServiceName ??= guessLocalService(services as Record<string, unknown>, repoPath)

      for (const [svcName, svcDef] of Object.entries(services)) {
        const env = parseComposeEnv(svcDef?.environment)
        for (const [k, v] of Object.entries(env)) {
          if (typeof v === 'string' && /^https?:\/\//.test(v)) {
            mappings.push({
              envVar: k,
              url: v,
              hostHint: extractHost(v),
              sourceFile: `${dcName}#${svcName}`,
            })
          }
        }
      }

      // Even if no env URLs, expose service names as hostHints so HTTP-call
      // detector can resolve `http://payments:3000` → payments service.
      for (const svcName of serviceNames) {
        mappings.push({
          envVar: `__docker_service__`,
          url: `http://${svcName}`,
          hostHint: svcName,
          sourceFile: `${dcName}#${svcName}`,
        })
      }
    } catch {
      // ignore malformed compose
    }
  }

  // ── Spring application*.yml / .properties / bootstrap* ────────────────────
  mappings.push(...extractSpringConfig(repoPath))

  return { mappings, dockerServiceName }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    const m = url.match(/^https?:\/\/([^/:]+)/)
    return m ? m[1] : url
  }
}

function parseComposeEnv(env: unknown): Record<string, string> {
  if (!env) return {}
  if (Array.isArray(env)) {
    const out: Record<string, string> = {}
    for (const item of env) {
      if (typeof item !== 'string') continue
      const eq = item.indexOf('=')
      if (eq > 0) out[item.slice(0, eq)] = item.slice(eq + 1)
    }
    return out
  }
  if (typeof env === 'object') {
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
      if (v != null) out[k] = String(v)
    }
    return out
  }
  return {}
}

function guessLocalService(
  services: Record<string, unknown>,
  repoPath: string
): string | undefined {
  const base = path.basename(repoPath).toLowerCase()
  for (const name of Object.keys(services)) {
    if (name.toLowerCase() === base) return name
  }
  for (const [name, def] of Object.entries(services)) {
    const build = (def as { build?: unknown })?.build
    if (build === '.' || (build as { context?: string })?.context === '.') return name
  }
  return undefined
}

// ── Spring config parsing ────────────────────────────────────────────────────

const SPRING_CONFIG_GLOB = [
  '**/application*.yml',
  '**/application*.yaml',
  '**/application*.properties',
  '**/bootstrap*.yml',
  '**/bootstrap*.yaml',
  '**/bootstrap*.properties',
]

const SPRING_CONFIG_IGNORE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/target/**',
  '**/.git/**',
  '**/.gradle/**',
  '**/out/**',
]

/** Match `${VAR}` or `${VAR:default-value}` — uppercase env-var convention. */
const ENV_VAR_TEMPLATE = /^\$\{([A-Z_][A-Z0-9_]*)(?::[^}]*)?\}$/

/** Last segment of a property path is "url" / "host" / "endpoint" / "uri",
 *  or ends with `-url` / `_url` / `.url` (and equivalents). Covers kebab-case
 *  (Spring's idiomatic style) and snake_case in `.properties`. */
function isUrlKey(lastSegment: string): boolean {
  return /(^|[-_])(url|host|endpoint|uri)$/i.test(lastSegment)
}

/** Recursively walk a parsed YAML object, collecting every string leaf with
 *  its dotted property path. Arrays are skipped (Spring config almost never
 *  uses arrays for URLs, and indexing them adds noise). */
function collectYamlLeaves(
  node: unknown,
  segments: string[],
  out: Array<{ propPath: string; value: string }>
): void {
  if (node == null) return
  if (typeof node === 'string') {
    out.push({ propPath: segments.join('.'), value: node })
    return
  }
  if (typeof node !== 'object' || Array.isArray(node)) return
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    collectYamlLeaves(v, [...segments, k], out)
  }
}

/**
 * Walk Spring config files (`application*.yml/.yaml/.properties`,
 * `bootstrap*`) and return ALL `propPath → envVar` bindings — regardless of
 * whether the key is URL-shaped. Used by the event detector to resolve
 * `@Value("${gcp.pubsub-publish-topic}") String topic` to its env var name
 * (so docs show "topic: STATUS_EVENT_TOPIC_NAME" instead of an opaque path).
 *
 * Returns an empty Map for repos with no Spring config. Result keys are the
 * dotted property paths exactly as they appear in the file; values are the
 * env var name (without the `${}` wrapping).
 */
export function extractSpringPropertyEnvVars(repoPath: string): Map<string, string> {
  const out = new Map<string, string>()
  let files: string[]
  try {
    files = fg.sync(SPRING_CONFIG_GLOB, {
      cwd: repoPath,
      ignore: SPRING_CONFIG_IGNORE,
      onlyFiles: true,
      absolute: true,
      caseSensitiveMatch: false,
    })
  } catch {
    return out
  }
  for (const file of files) {
    let text: string
    try { text = fs.readFileSync(file, 'utf-8') } catch { continue }
    if (/\.ya?ml$/i.test(file)) {
      let doc: unknown
      try { doc = yaml.parse(text) } catch { continue }
      const leaves: Array<{ propPath: string; value: string }> = []
      collectYamlLeaves(doc, [], leaves)
      for (const { propPath, value } of leaves) {
        const m = value.match(ENV_VAR_TEMPLATE)
        if (m && !out.has(propPath)) out.set(propPath, m[1])
      }
    } else if (/\.properties$/i.test(file)) {
      for (const rawLine of text.split('\n')) {
        const trimmed = rawLine.trim()
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
        const sep = trimmed.match(/^([^=:]+?)\s*[=:]\s*(.*)$/)
        if (!sep) continue
        const key = sep[1].trim()
        const value = sep[2].trim()
        const m = value.match(ENV_VAR_TEMPLATE)
        if (m && !out.has(key)) out.set(key, m[1])
      }
    }
  }
  return out
}

function extractSpringConfig(repoPath: string): ServiceUrlMapping[] {
  let files: string[]
  try {
    files = fg.sync(SPRING_CONFIG_GLOB, {
      cwd: repoPath,
      ignore: SPRING_CONFIG_IGNORE,
      onlyFiles: true,
      absolute: true,
      caseSensitiveMatch: false,
    })
  } catch {
    return []
  }

  const out: ServiceUrlMapping[] = []
  const seen = new Set<string>()
  const push = (m: ServiceUrlMapping): void => {
    const key = `${m.envVar}|${m.propertyPath ?? ''}|${m.url}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(m)
  }

  for (const file of files) {
    let text: string
    try {
      text = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    const rel = path.relative(repoPath, file)

    if (/\.ya?ml$/i.test(file)) {
      let doc: unknown
      try {
        doc = yaml.parse(text)
      } catch {
        continue
      }
      const leaves: Array<{ propPath: string; value: string }> = []
      collectYamlLeaves(doc, [], leaves)
      for (const { propPath, value } of leaves) {
        const lastSeg = propPath.split('.').pop() ?? ''
        if (!isUrlKey(lastSeg)) continue
        const m = value.match(ENV_VAR_TEMPLATE)
        if (!m) continue
        const envVar = m[1]
        push({
          envVar,
          url: value,                       // e.g. "${CATALOG_CORE_SERVICE_URL}"
          hostHint: envVar.toLowerCase(),   // best heuristic when URL isn't literal
          sourceFile: `${rel}#${propPath}`,
          propertyPath: propPath,
        })
      }
      continue
    }

    if (/\.properties$/i.test(file)) {
      // Java properties: `key=value` or `key:value`. # and ! start comments.
      // We intentionally don't handle line-continuation backslashes — URL values
      // are single-line in practice.
      for (const rawLine of text.split('\n')) {
        const trimmed = rawLine.trim()
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue
        const sep = trimmed.match(/^([^=:]+?)\s*[=:]\s*(.*)$/)
        if (!sep) continue
        const key = sep[1].trim()
        const value = sep[2].trim()
        const lastSeg = key.split('.').pop() ?? ''
        if (!isUrlKey(lastSeg)) continue
        const m = value.match(ENV_VAR_TEMPLATE)
        if (!m) continue
        const envVar = m[1]
        push({
          envVar,
          url: value,
          hostHint: envVar.toLowerCase(),
          sourceFile: `${rel}#${key}`,
          propertyPath: key,
        })
      }
    }
  }

  return out
}
