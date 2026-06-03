import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import type { SkillSection } from '../types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_NAME = 'repomap-docs-writer'

// ─────────────────────────────────────────────────────────────────────────────
// repomap-docs-writer skill loader.
// Locates the skill in one of (in order):
//   1. $REPOMAP_DOCS_SKILL  (absolute path, explicit override)
//   2. <cwd>/.claude/skills/repomap-docs-writer/   (project-level skill)
//   3. ~/.claude/skills/repomap-docs-writer/        (user-global skill)
//   4. bundled copy at <core>/dist/render/docs-skill/  (always present)
// Reads SKILL.md plus a (configurable) subset of references/*.md and returns
// a single string ready to append to a system prompt.
//
// Backwards compat:
//   loadDocsSkill()                → full legacy skill (all references).
//   loadDocsSkill({ sections })    → only those reference files (plus SKILL.md).
//   loadDocsSkill({ lean: true })  → prefers references/_compact/<x>.md when
//                                    present (distilled versions, ~30% size).
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry { text: string; source: string }
const cache = new Map<string, CacheEntry>()

export interface LoadedSkill {
  /** Full skill text (SKILL.md + selected references) ready to inject. */
  text: string
  /** Where the skill was loaded from — useful for debugging. */
  source: string
  /** Approximate token count (chars / 4). */
  approxTokens: number
  /** Section ids that were actually loaded (excluding 'core'). */
  sectionsLoaded: ReferenceSection[]
}

export interface LoadDocsSkillOpts {
  /** Subset of reference files to include. Omit (or pass null) for the
   *  legacy "all references" behaviour. 'core' is always implicit. */
  sections?: SkillSection[]
  /** When true, prefer the distilled `references/_compact/<x>.md` version
   *  if it exists, falling back to the full reference file otherwise. */
  lean?: boolean
  /** Bypass the in-memory cache. */
  force?: boolean
}

const SECTION_TO_FILE: Record<Exclude<SkillSection, 'core'>, string> = {
  templates: 'templates.md',
  diataxis: 'diataxis-for-repos.md',
  writing: 'writing-principles.md',
  diagrams: 'diagrams.md',
  examples: 'examples.md',
  integration: 'repomap-integration.md',
}

/**
 * Load the docs-writer skill. Without arguments, returns the legacy full
 * skill (SKILL.md + every references/*.md concatenated). With `sections`,
 * loads only the requested subset.
 */
export function loadDocsSkill(forceOrOpts: boolean | LoadDocsSkillOpts = false): LoadedSkill | null {
  const opts: LoadDocsSkillOpts = typeof forceOrOpts === 'boolean' ? { force: forceOrOpts } : forceOrOpts
  const dir = findSkillDir()
  if (!dir) return null

  const sections = normalizeSections(opts.sections)
  const lean = !!opts.lean
  const key = `${dir}::${sections.join(',')}::lean=${lean}`

  if (!opts.force) {
    const hit = cache.get(key)
    if (hit) {
      return { text: hit.text, source: hit.source, approxTokens: Math.round(hit.text.length / 4), sectionsLoaded: sections }
    }
  }

  const text = readSkill(dir, sections, lean)
  cache.set(key, { text, source: dir })
  return { text, source: dir, approxTokens: Math.round(text.length / 4), sectionsLoaded: sections }
}

/** Reset the in-memory cache. Mostly useful for tests. */
export function clearDocsSkillCache(): void {
  cache.clear()
}

type ReferenceSection = Exclude<SkillSection, 'core'>

function normalizeSections(sections: SkillSection[] | undefined): ReferenceSection[] {
  const order: ReferenceSection[] = ['templates', 'diataxis', 'writing', 'diagrams', 'examples', 'integration']
  if (!sections) {
    // Legacy: every reference file.
    return order
  }
  // De-dup, preserve a stable order so the cache key is canonical.
  const set = new Set(sections.filter((s): s is ReferenceSection => s !== 'core'))
  return order.filter((s) => set.has(s))
}

function findSkillDir(): string | null {
  const candidates: string[] = []
  if (process.env.REPOMAP_DOCS_SKILL) candidates.push(process.env.REPOMAP_DOCS_SKILL)
  candidates.push(path.join(process.cwd(), '.claude', 'skills', SKILL_NAME))
  candidates.push(path.join(os.homedir(), '.claude', 'skills', SKILL_NAME))
  candidates.push(path.join(__dirname, 'docs-skill'))

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'SKILL.md'))) return c
  }
  return null
}

function readSkill(dir: string, sections: ReferenceSection[], lean: boolean): string {
  const parts: string[] = []
  parts.push(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf-8'))

  const refsDir = path.join(dir, 'references')
  if (!fs.existsSync(refsDir)) return parts.join('\n')

  const compactDir = path.join(refsDir, '_compact')
  for (const section of sections) {
    const filename = SECTION_TO_FILE[section]
    const compactPath = path.join(compactDir, filename)
    const fullPath = path.join(refsDir, filename)
    let file: string | null = null
    if (lean && fs.existsSync(compactPath)) file = compactPath
    else if (fs.existsSync(fullPath)) file = fullPath
    if (!file) continue
    const tag = lean && file === compactPath ? `references/_compact/${filename}` : `references/${filename}`
    parts.push(`\n\n--- ${tag} ---\n\n` + fs.readFileSync(file, 'utf-8'))
  }
  return parts.join('\n')
}
