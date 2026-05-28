import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'
import type { PackageMeta, RepoConfig, RepoSummary } from '../types.js'
import { detectEndpoints } from './endpoints.js'
import { detectServiceUrls } from './service-urls.js'
import { scanRepoExports } from './ts-scanner.js'

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

  const [endpoints, languages, dependencies, exportedSymbols] = await Promise.all([
    detectEndpoints(absPath),
    detectLanguages(absPath),
    Promise.resolve(extractDependencies(absPath)),
    scanRepoExports(absPath),
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
    exportedSymbols: exportedSymbols.length > 0 ? exportedSymbols : undefined,
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
        version: pkg.version,
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
    const versionMatch = txt.match(/^version\s*=\s*"([^"]+)"/m)
    return {
      name: nameMatch?.[1],
      description: descMatch?.[1],
      version: versionMatch?.[1],
    }
  }
  // Gradle (Spring Boot, Android, plain Java/Kotlin)
  const gradleMeta = readGradleMeta(dirPath)
  if (gradleMeta) return gradleMeta
  // Maven
  const mavenMeta = readMavenMeta(dirPath)
  if (mavenMeta) return mavenMeta
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
  // Gradle: build.gradle / build.gradle.kts
  for (const name of ['build.gradle', 'build.gradle.kts']) {
    const p = path.join(repoPath, name)
    if (fs.existsSync(p)) return parseGradleDeps(fs.readFileSync(p, 'utf-8'))
  }
  // Maven
  const pom = path.join(repoPath, 'pom.xml')
  if (fs.existsSync(pom)) return parsePomDeps(fs.readFileSync(pom, 'utf-8'))
  return []
}

// ── Gradle / Maven parsers ───────────────────────────────────────────────────

/** Configurations whose dependencies end up on the runtime/compile classpath
 *  of the production code. We deliberately exclude `testImplementation`,
 *  `testRuntimeOnly`, `testCompileOnly`, `annotationProcessor` and friends
 *  — they aren't part of the documented runtime. */
const GRADLE_PROD_CONFIGS = ['implementation', 'api', 'compileOnly', 'runtimeOnly', 'developmentOnly']

function readGradleMeta(repoPath: string): PackageMeta | undefined {
  for (const name of ['build.gradle', 'build.gradle.kts']) {
    const p = path.join(repoPath, name)
    if (!fs.existsSync(p)) continue
    const text = fs.readFileSync(p, 'utf-8')
    const groupMatch = text.match(/^\s*group\s*=?\s*['"]([^'"]+)['"]/m)
    const versionMatch = text.match(/^\s*version\s*=?\s*['"]([^'"]+)['"]/m)
    // settings.gradle / .kts override the project name. Fall back to the
    // group-derived id and finally the folder basename.
    const rootName = readGradleRootProjectName(repoPath)
    const name2 = rootName ?? groupMatch?.[1] ?? path.basename(repoPath)
    // Surface the Spring Boot plugin version (if any) in `description` so
    // the LLM sees the framework at a glance without scanning every dep.
    const sbVersion = text.match(/id\s+['"]org\.springframework\.boot['"]\s+version\s+['"]([^'"]+)['"]/)
    const description = sbVersion ? `Spring Boot ${sbVersion[1]}` : undefined
    return {
      name: name2,
      description,
      version: versionMatch?.[1],
    }
  }
  return undefined
}

function readGradleRootProjectName(repoPath: string): string | undefined {
  for (const name of ['settings.gradle', 'settings.gradle.kts']) {
    const p = path.join(repoPath, name)
    if (!fs.existsSync(p)) continue
    const text = fs.readFileSync(p, 'utf-8')
    const m = text.match(/rootProject\.name\s*=\s*['"]([^'"]+)['"]/)
    if (m) return m[1]
  }
  return undefined
}

/** Parse Gradle dep declarations into `group:artifact` coordinates. Handles:
 *    implementation 'g:a:v'
 *    implementation ('g:a:v')
 *    implementation('g:a:v')
 *    implementation platform('g:a:v')   ← BOMs
 *    runtimeOnly 'g:a'                  ← no version (managed externally)
 *  Skips test/annotation-processor configurations entirely. The version is
 *  dropped from the output (LLM cares about identity, not exact version). */
function parseGradleDeps(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const configsAlt = GRADLE_PROD_CONFIGS.join('|')
  const re = new RegExp(
    `^\\s*(?:${configsAlt})\\s*\\(?\\s*(?:platform\\s*\\(\\s*)?['"]([\\w.\\-]+):([\\w.\\-]+)(?::[\\w.\\-+]+)?['"]`,
    'gm',
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const coord = `${m[1]}:${m[2]}`
    if (!seen.has(coord)) {
      seen.add(coord)
      out.push(coord)
    }
  }
  return out
}

function readMavenMeta(repoPath: string): PackageMeta | undefined {
  const p = path.join(repoPath, 'pom.xml')
  if (!fs.existsSync(p)) return undefined
  const text = fs.readFileSync(p, 'utf-8')
  // Project-level fields are siblings of <project> root. We scope the regex
  // to the FIRST occurrence — <parent>...</parent> blocks also contain
  // groupId/artifactId/version, which we don't want to leak into the
  // project's own meta.
  const projectFields = stripParentBlock(text)
  const artifactId = projectFields.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]
  const explicitName = projectFields.match(/<name>([^<]+)<\/name>/)?.[1]
  const description = projectFields.match(/<description>([^<]+)<\/description>/)?.[1]
  const version = projectFields.match(/<version>([^<]+)<\/version>/)?.[1]
  if (!artifactId && !explicitName) return undefined
  return {
    name: explicitName ?? artifactId,
    description: description ?? deriveMavenFrameworkHint(text),
    version,
  }
}

/** Surface Spring Boot from a Maven `<parent>` block as a soft hint. */
function deriveMavenFrameworkHint(pomText: string): string | undefined {
  const parent = pomText.match(/<parent>([\s\S]*?)<\/parent>/)?.[1]
  if (!parent) return undefined
  const group = parent.match(/<groupId>([^<]+)<\/groupId>/)?.[1]
  const artifact = parent.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]
  const version = parent.match(/<version>([^<]+)<\/version>/)?.[1]
  if (group === 'org.springframework.boot' && artifact === 'spring-boot-starter-parent') {
    return version ? `Spring Boot ${version}` : 'Spring Boot'
  }
  return undefined
}

/** Remove the `<parent>...</parent>` block so subsequent regex queries on
 *  <groupId>/<version>/<artifactId> hit the project's own values, not the
 *  parent POM's. */
function stripParentBlock(pomText: string): string {
  return pomText.replace(/<parent>[\s\S]*?<\/parent>/, '')
}

/** Parse Maven `<dependency>` blocks into `groupId:artifactId` coordinates.
 *  Skips `<scope>test</scope>` dependencies. */
function parsePomDeps(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const re = /<dependency>([\s\S]*?)<\/dependency>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const body = m[1]
    if (/<scope>\s*test\s*<\/scope>/i.test(body)) continue
    const g = body.match(/<groupId>([^<]+)<\/groupId>/)?.[1]
    const a = body.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]
    if (!g || !a) continue
    const coord = `${g.trim()}:${a.trim()}`
    if (!seen.has(coord)) {
      seen.add(coord)
      out.push(coord)
    }
  }
  return out
}
