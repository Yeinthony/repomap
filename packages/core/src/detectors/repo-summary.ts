import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'
import type { PackageMeta, RepoConfig, RepoSummary } from '../types.js'
import { detectEndpoints } from './endpoints.js'
import { detectServiceUrls } from './service-urls.js'

const LANG_BY_EXT: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python', '.go': 'go', '.rb': 'ruby',
  '.java': 'java', '.rs': 'rust', '.cs': 'csharp', '.php': 'php',
}

const README_CANDIDATES = [
  'README.md', 'README.es.md', 'README.en.md',
  'README.markdown', 'README.txt', 'README', 'readme.md',
]
const README_MAX_CHARS = 2500

export async function buildRepoSummary(repo: RepoConfig): Promise<RepoSummary> {
  const absPath = path.resolve(repo.path)
  if (!fs.existsSync(absPath)) {
    throw new Error(`Repo path not found: ${absPath}`)
  }

  const [endpoints, languages, dependencies] = await Promise.all([
    detectEndpoints(absPath),
    detectLanguages(absPath),
    Promise.resolve(extractDependencies(absPath)),
  ])
  const { mappings, dockerServiceName } = detectServiceUrls(absPath)

  return {
    name: repo.name,
    path: absPath,
    languages,
    endpoints,
    serviceUrls: mappings,
    envVars: [],
    dependencies,
    dockerService: dockerServiceName,
    readme: readReadme(absPath),
    packageMeta: readPackageMeta(absPath),
  }
}

function readReadme(repoPath: string): string | undefined {
  for (const name of README_CANDIDATES) {
    const p = path.join(repoPath, name)
    if (fs.existsSync(p)) {
      try {
        const text = fs.readFileSync(p, 'utf-8')
        return text.length > README_MAX_CHARS
          ? text.slice(0, README_MAX_CHARS) + '\n\n…(truncated)'
          : text
      } catch { /* skip */ }
    }
  }
  return undefined
}

export function readPackageMeta(dirPath: string): PackageMeta | undefined {
  const pkgPath = path.join(dirPath, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      return {
        name: pkg.name,
        description: pkg.description,
        main: pkg.main,
        bin: pkg.bin,
        scripts: pkg.scripts,
        keywords: pkg.keywords,
      }
    } catch { /* malformed */ }
  }
  const pyproject = path.join(dirPath, 'pyproject.toml')
  if (fs.existsSync(pyproject)) {
    const txt = fs.readFileSync(pyproject, 'utf-8')
    const nameMatch = txt.match(/^name\s*=\s*"([^"]+)"/m)
    const descMatch = txt.match(/^description\s*=\s*"([^"]+)"/m)
    return {
      name: nameMatch?.[1],
      description: descMatch?.[1],
    }
  }
  return undefined
}

async function detectLanguages(repoPath: string): Promise<string[]> {
  const files = await fg('**/*.*', {
    cwd: repoPath,
    ignore: ['**/node_modules/**', '**/dist/**', '**/.git/**', '**/build/**'],
    onlyFiles: true,
  })
  const langs = new Set<string>()
  for (const f of files) {
    const lang = LANG_BY_EXT[path.extname(f)]
    if (lang) langs.add(lang)
  }
  return [...langs]
}

function extractDependencies(repoPath: string): string[] {
  const pkgPath = path.join(repoPath, 'package.json')
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
      return [
        ...Object.keys(pkg.dependencies ?? {}),
        ...Object.keys(pkg.peerDependencies ?? {}),
      ]
    } catch {
      return []
    }
  }
  const reqPath = path.join(repoPath, 'requirements.txt')
  if (fs.existsSync(reqPath)) {
    return fs.readFileSync(reqPath, 'utf-8')
      .split('\n')
      .map((l) => l.split(/[=<>~]/)[0].trim())
      .filter(Boolean)
  }
  const goMod = path.join(repoPath, 'go.mod')
  if (fs.existsSync(goMod)) {
    const out: string[] = []
    for (const line of fs.readFileSync(goMod, 'utf-8').split('\n')) {
      const m = line.trim().match(/^([\w./-]+)\s+v[\d.]/)
      if (m) out.push(m[1])
    }
    return out
  }
  return []
}
