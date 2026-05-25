import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'

// ─────────────────────────────────────────────────────────────────────────────
// Static TypeScript/JavaScript export scanner.
// Regex-based, no compiler dependency. Extracts exported symbols grouped by
// file so compactForLLM can feed symbol-level context to the LLM.
// ─────────────────────────────────────────────────────────────────────────────

export interface ScannedSymbol {
  name: string
  kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'variable' | 'enum'
  async: boolean
  line: number
}

export interface FileExports {
  file: string          // relative path from repo root
  symbols: ScannedSymbol[]
}

// Patterns that match top-level exports. Each captures (name, modifiers).
const EXPORT_PATTERNS: Array<{ re: RegExp; kind: ScannedSymbol['kind']; asyncFlag?: boolean }> = [
  { re: /^export\s+async\s+function\s+(\w+)/m, kind: 'function', asyncFlag: true },
  { re: /^export\s+function\s+(\w+)/m, kind: 'function' },
  { re: /^export\s+default\s+async\s+function\s+(\w+)/m, kind: 'function', asyncFlag: true },
  { re: /^export\s+default\s+function\s+(\w+)/m, kind: 'function' },
  { re: /^export\s+(abstract\s+)?class\s+(\w+)/m, kind: 'class' },
  { re: /^export\s+interface\s+(\w+)/m, kind: 'interface' },
  { re: /^export\s+type\s+(\w+)\s*[={<]/m, kind: 'type' },
  { re: /^export\s+enum\s+(\w+)/m, kind: 'enum' },
  { re: /^export\s+const\s+(\w+)/m, kind: 'const' },
  { re: /^export\s+let\s+(\w+)/m, kind: 'variable' },
]

// Full-file scan: finds every exported symbol and its line number.
function scanFile(absPath: string, relPath: string): FileExports {
  let src: string
  try {
    src = fs.readFileSync(absPath, 'utf-8')
  } catch {
    return { file: relPath, symbols: [] }
  }

  const lines = src.split('\n')
  const symbols: ScannedSymbol[] = []
  const seen = new Set<string>()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trimStart().startsWith('export')) continue

    for (const pat of EXPORT_PATTERNS) {
      const m = line.match(pat.re.source.startsWith('^') ? new RegExp(pat.re.source.slice(1)) : pat.re)
      if (!m) continue
      // Group index: class pattern has optional 'abstract' group so name is in group 2
      const name = pat.kind === 'class' ? (m[2] ?? m[1]) : m[1]
      if (!name || seen.has(name)) break
      seen.add(name)
      symbols.push({
        name,
        kind: pat.kind,
        async: pat.asyncFlag ?? false,
        line: i + 1,
      })
      break
    }
  }

  return { file: relPath, symbols }
}

export async function scanRepoExports(repoPath: string): Promise<FileExports[]> {
  const absRoot = path.resolve(repoPath)
  const files = await fg('**/*.{ts,tsx,js,jsx}', {
    cwd: absRoot,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '**/build/**',
      '**/*.d.ts',
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/__tests__/**',
    ],
    onlyFiles: true,
  })

  const results: FileExports[] = []
  for (const rel of files.sort()) {
    const entry = scanFile(path.join(absRoot, rel), rel)
    if (entry.symbols.length > 0) results.push(entry)
  }
  return results
}
