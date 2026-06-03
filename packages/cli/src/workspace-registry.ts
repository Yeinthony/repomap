import fs from 'fs'
import os from 'os'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// WORKSPACE REGISTRY
//
// `repomap init` writes the config + docs into a workspace dir that is
// separate from the source repo (so the source stays clean). To let later
// commands like `repomap doctor` / `generate` find that workspace when run
// from the source dir, init records the mapping in
//   ~/.config/repomap/workspaces.json
//
// The registry is a single JSON file with a flat list of entries. It is
// safe to delete by hand; commands will just fall back to "no config".
// ─────────────────────────────────────────────────────────────────────────────

const REGISTRY_DIR = path.join(os.homedir(), '.config', 'repomap')
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'workspaces.json')

export interface WorkspaceEntry {
  /** Absolute path to the workspace's repomap.config.yml. */
  configPath: string
  /** Absolute paths to the source repos this workspace documents. */
  sourcePaths: string[]
  /** ISO 8601 timestamp of when the entry was last written. Most-recent
   *  wins when multiple workspaces match the same source. */
  createdAt: string
}

interface Registry {
  workspaces: WorkspaceEntry[]
}

/** Idempotent: replaces any prior entry with the same configPath. */
export function registerWorkspace(configPath: string, sourcePaths: string[]): void {
  const entry: WorkspaceEntry = {
    configPath: path.resolve(configPath),
    sourcePaths: sourcePaths.map((p) => path.resolve(p)),
    createdAt: new Date().toISOString(),
  }
  const reg = readRegistry()
  reg.workspaces = reg.workspaces.filter((w) => w.configPath !== entry.configPath)
  reg.workspaces.push(entry)
  writeRegistry(reg)
}

/** Return workspaces that document the given source directory (or any of
 *  its ancestors recorded as a source path). Stale entries whose configPath
 *  no longer exists are filtered out on the fly. Most-recent first. */
export function findWorkspacesForSource(sourceDir: string): WorkspaceEntry[] {
  const abs = path.resolve(sourceDir)
  const reg = readRegistry()
  return reg.workspaces
    .filter((w) =>
      fs.existsSync(w.configPath) &&
      w.sourcePaths.some((s) => abs === s || abs.startsWith(s + path.sep))
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

function readRegistry(): Registry {
  if (!fs.existsSync(REGISTRY_PATH)) return { workspaces: [] }
  try {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8')) as Registry
    return parsed?.workspaces ? parsed : { workspaces: [] }
  } catch {
    return { workspaces: [] }
  }
}

function writeRegistry(reg: Registry): void {
  fs.mkdirSync(REGISTRY_DIR, { recursive: true })
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2))
}
