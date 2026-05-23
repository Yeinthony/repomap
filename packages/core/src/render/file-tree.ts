import fs from 'fs'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────────
// File tree renderer
// Produces an ASCII tree of a repo with sensible ignore rules + truncation,
// plus per-entry HTML for coloring (folders amber, files muted, lines faint).
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_IGNORE = new Set([
  'node_modules', 'dist', 'build', '.git', '.next', '.nuxt', 'coverage',
  '.cache', '.parcel-cache', '.turbo', '__pycache__', '.pytest_cache',
  '.venv', 'venv', '.idea', '.vscode', '.DS_Store',
  'graphify-out', 'repomap-docs',
])

const IGNORE_FILE_PATTERNS = [
  /\.lock$/, /\.log$/, /\.pyc$/, /\.tsbuildinfo$/,
  /\.d\.ts$/, /\.map$/,
  /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/,
]

interface TreeOpts {
  maxDepth?: number
  maxEntries?: number
}

export interface TreeLine {
  prefix: string         // "├── ", "└── ", "│   "
  name: string
  isDir: boolean
  truncated?: boolean    // this entry indicates omitted siblings
}

export function buildFileTree(repoPath: string, opts: TreeOpts = {}): TreeLine[] {
  const maxDepth = opts.maxDepth ?? 4
  const maxEntries = opts.maxEntries ?? 200

  const lines: TreeLine[] = []
  if (!fs.existsSync(repoPath)) return lines

  const stat = fs.statSync(repoPath)
  if (!stat.isDirectory()) return lines

  lines.push({ prefix: '', name: path.basename(repoPath) + '/', isDir: true })
  walk(repoPath, '', 0, maxDepth, maxEntries, lines)
  return lines
}

function walk(dir: string, prefix: string, depth: number, maxDepth: number, maxEntries: number, out: TreeLine[]): void {
  if (depth >= maxDepth) {
    out.push({ prefix: prefix + '└── ', name: '…', isDir: false, truncated: true })
    return
  }
  if (out.length >= maxEntries) return

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  const filtered = entries
    .filter((e) => !shouldIgnore(e))
    .sort((a, b) => {
      // folders first, then alpha
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })

  filtered.forEach((entry, i) => {
    if (out.length >= maxEntries) {
      if (i === 0 || out[out.length - 1].truncated) return
      out.push({ prefix: prefix + '└── ', name: `… (+${filtered.length - i} more)`, isDir: false, truncated: true })
      return
    }
    const last = i === filtered.length - 1
    const connector = last ? '└── ' : '├── '
    out.push({
      prefix: prefix + connector,
      name: entry.name + (entry.isDirectory() ? '/' : ''),
      isDir: entry.isDirectory(),
    })
    if (entry.isDirectory()) {
      const nextPrefix = prefix + (last ? '    ' : '│   ')
      walk(path.join(dir, entry.name), nextPrefix, depth + 1, maxDepth, maxEntries, out)
    }
  })
}

function shouldIgnore(entry: fs.Dirent): boolean {
  if (DEFAULT_IGNORE.has(entry.name)) return true
  if (entry.name.startsWith('.') && entry.name.length > 1 && !['env', 'env.example', 'env.sample', 'gitignore'].includes(entry.name.slice(1))) {
    // hide dot-files except a few well-known ones
    if (!['env', 'env.example', 'env.sample', 'env.local', 'gitignore', 'github', 'editorconfig'].includes(entry.name.slice(1).split('.')[0])) {
      return true
    }
  }
  if (!entry.isDirectory()) {
    if (IGNORE_FILE_PATTERNS.some((re) => re.test(entry.name))) return true
  }
  return false
}

/**
 * Render a list of TreeLines as colored HTML inside a code-block container.
 * Folders → accent, files → text, tree connectors → faint.
 */
export function renderTreeHTML(lines: TreeLine[]): string {
  if (lines.length === 0) return ''
  const rows = lines.map((l) => {
    const safePrefix = escapeHTML(l.prefix)
    const safeName = escapeHTML(l.name)
    const cls = l.truncated ? 'tree-truncated' : (l.isDir ? 'tree-dir' : 'tree-file')
    return `<span class="tree-line"><span class="tree-prefix">${safePrefix}</span><span class="${cls}">${safeName}</span></span>`
  })
  return `<pre class="tree-block"><code>${rows.join('\n')}</code></pre>`
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
