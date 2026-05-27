import fs from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG DUMP
// When REPOMAP_DEBUG_DIR is set (by the CLI's --debug flag), any module can
// drop an artifact into that directory via debugDump(). When unset, all calls
// are no-ops, so production code paths stay clean.
// ─────────────────────────────────────────────────────────────────────────────

export function isDebugEnabled(): boolean {
  return typeof process.env.REPOMAP_DEBUG_DIR === 'string' && process.env.REPOMAP_DEBUG_DIR.length > 0
}

export function debugDir(): string | null {
  return isDebugEnabled() ? (process.env.REPOMAP_DEBUG_DIR as string) : null
}

export function debugDump(name: string, content: string | Buffer): void {
  const dir = debugDir()
  if (!dir) return
  try {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, name), content)
  } catch {
    // Debug dumps are best-effort: never break the main pipeline because
    // we couldn't write a log file.
  }
}

export function debugDumpJson(name: string, value: unknown): void {
  if (!isDebugEnabled()) return
  try {
    debugDump(name, JSON.stringify(value, null, 2))
  } catch {
    // ignore
  }
}
