import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SKILL_NAME = 'repomap-docs-writer'

// ─────────────────────────────────────────────────────────────────────────────
// repomap-docs-writer skill loader.
// Locates the skill in one of (in order):
//   1. $REPOMAP_DOCS_SKILL  (absolute path, explicit override)
//   2. <cwd>/.claude/skills/repomap-docs-writer/   (project-level skill)
//   3. ~/.claude/skills/repomap-docs-writer/        (user-global skill)
//   4. bundled copy at <core>/dist/render/docs-skill/  (always present)
// Reads SKILL.md plus every references/*.md and returns a single string ready
// to append to a system prompt.
// ─────────────────────────────────────────────────────────────────────────────

let cached: string | null = null
let cachedSource: string | null = null

export interface LoadedSkill {
  /** Full skill text (SKILL.md + references) ready to inject into a prompt. */
  text: string
  /** Where the skill was loaded from — useful for debugging. */
  source: string
  /** Approximate token count (chars / 4). */
  approxTokens: number
}

export function loadDocsSkill(force = false): LoadedSkill | null {
  if (!force && cached != null && cachedSource != null) {
    return { text: cached, source: cachedSource, approxTokens: Math.round(cached.length / 4) }
  }

  const dir = findSkillDir()
  if (!dir) return null

  const text = readSkillDir(dir)
  cached = text
  cachedSource = dir
  return { text, source: dir, approxTokens: Math.round(text.length / 4) }
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

function readSkillDir(dir: string): string {
  const parts: string[] = []
  parts.push(fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf-8'))

  const refsDir = path.join(dir, 'references')
  if (fs.existsSync(refsDir)) {
    const files = fs.readdirSync(refsDir).filter((f) => f.endsWith('.md')).sort()
    for (const f of files) {
      parts.push(`\n\n--- references/${f} ---\n\n` + fs.readFileSync(path.join(refsDir, f), 'utf-8'))
    }
  }
  return parts.join('\n')
}
