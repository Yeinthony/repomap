import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'
import type { APIEndpoint } from '../types.js'

const CODE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rb', '.java']
const IGNORE = ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**', '**/coverage/**']

/**
 * Detect HTTP endpoints (Express/Fastify/NestJS, Flask, FastAPI) and
 * event publishers (.emit/.publish/.send) inside a repo.
 */
export async function detectEndpoints(repoPath: string): Promise<APIEndpoint[]> {
  const files = await fg('**/*', {
    cwd: repoPath,
    ignore: IGNORE,
    onlyFiles: true,
    absolute: true,
  })

  const endpoints: APIEndpoint[] = []

  for (const file of files) {
    if (!CODE_EXTS.includes(path.extname(file))) continue
    let content: string
    try {
      content = fs.readFileSync(file, 'utf-8')
    } catch {
      continue
    }
    const relFile = path.relative(repoPath, file)

    // ── Express / Fastify / generic router .get/.post/.put/.patch/.delete ──
    const expressPattern = /\b(?:app|router|server|fastify)\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi
    let m: RegExpExecArray | null
    while ((m = expressPattern.exec(content)) !== null) {
      endpoints.push({
        method: m[1].toUpperCase(),
        path: m[2],
        type: 'http',
        sourceFile: relFile,
      })
    }

    // ── NestJS decorators ──
    const nestPattern = /@(Get|Post|Put|Patch|Delete)\s*\(\s*['"`]?([^'"`)]*?)['"`]?\s*\)/g
    while ((m = nestPattern.exec(content)) !== null) {
      endpoints.push({
        method: m[1].toUpperCase(),
        path: m[2] || '/',
        type: 'http',
        sourceFile: relFile,
      })
    }

    // ── Flask / FastAPI ──
    const pyHttpPattern = /@(?:app|router)\.(get|post|put|patch|delete|route)\s*\(\s*['"`]([^'"`]+)['"`]/gi
    while ((m = pyHttpPattern.exec(content)) !== null) {
      endpoints.push({
        method: m[1].toUpperCase(),
        path: m[2],
        type: 'http',
        sourceFile: relFile,
      })
    }

    // ── Event publishers ──
    const evPattern = /\.\s*(emit|publish|send)\s*\(\s*['"`]([^'"`]+)['"`]/g
    while ((m = evPattern.exec(content)) !== null) {
      endpoints.push({
        eventName: m[2],
        type: 'event',
        sourceFile: relFile,
      })
    }
  }

  return dedupe(endpoints)
}

function dedupe(eps: APIEndpoint[]): APIEndpoint[] {
  const seen = new Set<string>()
  const out: APIEndpoint[] = []
  for (const ep of eps) {
    const k = `${ep.type}|${ep.method ?? ''}|${ep.path ?? ''}|${ep.eventName ?? ''}`
    if (!seen.has(k)) {
      seen.add(k)
      out.push(ep)
    }
  }
  return out
}
