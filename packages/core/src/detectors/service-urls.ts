import fs from 'fs'
import path from 'path'
import yaml from 'yaml'
import type { ServiceUrlMapping } from '../types.js'

/**
 * Extract service-URL mappings from a repo:
 *   1. Any `.env*` file → VAR=URL pairs whose value looks like an HTTP URL
 *   2. docker-compose.yml `environment:` blocks
 *   3. docker-compose.yml `services:` (the service names themselves — used
 *      to resolve internal references like `http://payments:3000`)
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
