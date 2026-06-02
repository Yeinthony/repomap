import fs from 'fs'
import path from 'path'
import fg from 'fast-glob'
import type { FileExports, ScannedSymbol } from './ts-scanner.js'

// ─────────────────────────────────────────────────────────────────────────────
// Static Java/Spring scanner.
// Regex-based, no compiler dependency. For each .java file, extracts the
// top-level public type (class/interface/enum), the Spring stereotype
// annotation if any (@RestController, @Service, @Repository, @Component,
// @Configuration, @Entity), and the names of its public methods.
//
// The output uses the same FileExports shape as ts-scanner so compactForLLM
// renders them through one code path. The Spring stereotype rides on the
// optional `tag` field — controllers/services rank highest in priority sort.
// ─────────────────────────────────────────────────────────────────────────────

const SPRING_STEREOTYPES = [
  'RestController',
  'Controller',
  'RestControllerAdvice',
  'ControllerAdvice',
  'Service',
  'Repository',
  'Component',
  'Configuration',
  'Entity',
] as const

type Stereotype = (typeof SPRING_STEREOTYPES)[number]

const STEREOTYPE_KIND_MAP: Record<Stereotype, ScannedSymbol['kind']> = {
  RestController: 'class',
  Controller: 'class',
  RestControllerAdvice: 'class',
  ControllerAdvice: 'class',
  Service: 'class',
  Repository: 'class',
  Component: 'class',
  Configuration: 'class',
  Entity: 'class',
}

export async function scanRepoJava(repoPath: string): Promise<FileExports[]> {
  const absRoot = path.resolve(repoPath)
  const files = await fg('**/*.java', {
    cwd: absRoot,
    ignore: [
      '**/node_modules/**',
      '**/build/**',
      '**/target/**',
      '**/.git/**',
      '**/src/test/**',
    ],
    onlyFiles: true,
  })

  const out: FileExports[] = []
  for (const rel of files.sort()) {
    const entry = scanJavaFile(path.join(absRoot, rel), rel)
    if (entry.symbols.length > 0) out.push(entry)
  }
  return out
}

function scanJavaFile(absPath: string, relPath: string): FileExports {
  let src: string
  try {
    src = fs.readFileSync(absPath, 'utf-8')
  } catch {
    return { file: relPath, symbols: [] }
  }

  const lines = src.split('\n')
  const symbols: ScannedSymbol[] = []

  // Locate the top-level type declaration. Java permits multiple types per
  // file but in practice production code has one public type — we document
  // that one. Match `[public] [abstract|final] class|interface|enum Name`.
  const typeDeclRe =
    /^(?:public\s+)?(?:abstract\s+|final\s+|sealed\s+|non-sealed\s+|static\s+)*(class|interface|enum|record)\s+(\w+)/

  let typeLineIdx = -1
  let typeKind: 'class' | 'interface' | 'enum' = 'class'
  let typeName = ''
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(typeDeclRe)
    if (m) {
      typeLineIdx = i
      const k = m[1]
      typeKind = k === 'interface' ? 'interface' : k === 'enum' ? 'enum' : 'class'
      typeName = m[2]
      break
    }
  }
  if (typeLineIdx === -1) return { file: relPath, symbols: [] }

  // Walk backwards from the type declaration collecting annotations until we
  // hit a blank line, an import, or a package statement. Annotations can span
  // multiple lines with parameters — we only need the bare names.
  const tag = pickSpringStereotype(collectClassAnnotations(lines, typeLineIdx))

  // Collect public methods inside the class body. We scan from the type line
  // onward and use a brace counter to know we're at depth 1 (class body).
  // Methods at deeper depths (nested classes, anonymous classes, lambdas)
  // are intentionally skipped — they add noise without helping the LLM
  // understand the public API surface.
  const members = collectPublicMethodNames(src, typeLineIdx, typeName)

  symbols.push({
    name: typeName,
    kind: typeKind,
    async: false,
    line: typeLineIdx + 1,
    ...(tag ? { tag: `@${tag}` } : {}),
    ...(members.length > 0 ? { members } : {}),
  })

  return { file: relPath, symbols }
}

/** Read upward from the type declaration line gathering annotation names.
 *  Stops at a non-annotation, non-blank, non-modifier line. */
function collectClassAnnotations(lines: string[], typeLineIdx: number): string[] {
  const annotations: string[] = []
  let depth = 0
  for (let i = typeLineIdx - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line === '') continue
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue

    // Track unbalanced parens for multi-line annotations like
    //   @RequestMapping(
    //     value = "/x",
    //     produces = "json"
    //   )
    const open = (line.match(/\(/g) ?? []).length
    const close = (line.match(/\)/g) ?? []).length
    depth += close - open

    const annMatch = line.match(/^@(\w+)/)
    if (annMatch) {
      annotations.push(annMatch[1])
      if (depth <= 0) depth = 0
      continue
    }
    // Modifiers/whitespace between annotation and class — keep scanning.
    if (/^(public|abstract|final|sealed|non-sealed|static)\b/.test(line)) continue
    // Anything else (import, package, prior member, comment block) → stop.
    if (depth === 0) break
  }
  return annotations
}

function pickSpringStereotype(annotations: string[]): Stereotype | null {
  for (const ann of annotations) {
    if ((SPRING_STEREOTYPES as readonly string[]).includes(ann)) {
      return ann as Stereotype
    }
  }
  return null
}

/** Extract names of public methods declared directly on the top-level class
 *  body (depth === 1). Constructors (method name === class name) are skipped. */
function collectPublicMethodNames(src: string, typeLineIdx: number, typeName: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  // Slice from the type declaration onward to avoid catching methods of
  // helper classes above (rare but possible).
  const lines = src.split('\n').slice(typeLineIdx)
  let depth = 0
  let bodyStarted = false

  // public/protected modifier + optional static/final/synchronized/abstract +
  // optional generic <T...> + a return type token + method name + '('.
  // The return type group is intentionally loose ([\w<>?,.\s\[\]]+?) — Java
  // generics, arrays and varargs all flow through it.
  const methodRe =
    /^\s*public\s+(?:static\s+|final\s+|synchronized\s+|abstract\s+|default\s+)*(?:<[^>]+>\s+)?[\w<>?,.\s\[\]]+?\s+(\w+)\s*\(/

  for (const raw of lines) {
    const line = raw

    // Track brace depth across the whole file body. Strings can contain
    // braces, but for our purpose (cheap heuristic) the noise is acceptable.
    for (const ch of line) {
      if (ch === '{') {
        depth++
        if (depth === 1) bodyStarted = true
      } else if (ch === '}') {
        depth--
      }
    }
    if (!bodyStarted) continue
    // Only methods declared at depth 1 (immediate class body) qualify.
    // Note: by the time we scan `line`, the opening `{` of the method's
    // signature line bumps depth to 2, but the method's *declaration* sits
    // on a line where depth was 1 before any `{` on that line was seen.
    // We approximate by requiring depth to be 1 OR 2 at the time we see the
    // signature — methods with their `{` on the same line bump depth to 2.
    if (depth > 2) continue

    const m = line.match(methodRe)
    if (!m) continue
    const name = m[1]
    if (name === typeName) continue // constructor
    // Filter common Java keywords that the loose return-type regex can
    // accidentally pick up as a method name when they appear at the start
    // of a statement, e.g. `public class Inner { … }`.
    if (name === 'class' || name === 'interface' || name === 'enum' || name === 'record') continue
    if (seen.has(name)) continue
    seen.add(name)
    out.push(name)
    if (out.length >= 12) break
  }
  return out
}
