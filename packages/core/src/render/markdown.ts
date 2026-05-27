import fs from 'fs'
import path from 'path'
import type {
  Documentation,
  ServiceDoc,
  IntegrationDoc,
  GettingStartedDoc,
  TutorialDoc,
  TroubleshootingDoc,
  ApiReferenceDoc,
} from '../types.js'
import { slugify } from './html.js'
import { type Lang, t } from './i18n.js'

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN RENDERER
//
// Produces a flat-file documentation site that drops cleanly into Notion,
// Obsidian, GitBook, MkDocs, Docusaurus, or GitHub. Uses ```mermaid``` fenced
// blocks (universal renderer support) instead of inline HTML.
//
// Layout:
//   README.md              ← overview, becomes the entry page
//   integrations.md
//   <service-slug>.md      ← one per service, flat (no nested dirs)
//   getting-started/
//     quick-start.md
//     installation.md
//     first-project.md
//     troubleshooting.md
// ─────────────────────────────────────────────────────────────────────────────

export function generateMarkdown(
  docs: Documentation,
  outputPath: string,
  lang: Lang = 'en'
): void {
  fs.mkdirSync(outputPath, { recursive: true })

  fs.writeFileSync(path.join(outputPath, 'README.md'), buildOverviewMd(docs, lang))
  fs.writeFileSync(path.join(outputPath, 'integrations.md'), buildIntegrationsMd(docs.integrations, lang))

  for (const service of docs.services) {
    const filename = `${slugify(service.name)}.md`
    fs.writeFileSync(path.join(outputPath, filename), buildServiceMd(service, lang))
  }

  if (docs.gettingStarted && hasAnyTutorial(docs.gettingStarted)) {
    const gsDir = path.join(outputPath, 'getting-started')
    fs.mkdirSync(gsDir, { recursive: true })
    if (docs.gettingStarted.quickStart) {
      fs.writeFileSync(path.join(gsDir, 'quick-start.md'), buildTutorialMd(docs.gettingStarted.quickStart, lang))
    }
    if (docs.gettingStarted.installation) {
      fs.writeFileSync(path.join(gsDir, 'installation.md'), buildTutorialMd(docs.gettingStarted.installation, lang))
    }
    if (docs.gettingStarted.firstProject) {
      fs.writeFileSync(path.join(gsDir, 'first-project.md'), buildTutorialMd(docs.gettingStarted.firstProject, lang))
    }
    if (docs.gettingStarted.troubleshooting) {
      fs.writeFileSync(path.join(gsDir, 'troubleshooting.md'), buildTroubleshootingMd(docs.gettingStarted.troubleshooting, lang))
    }
  }
}

// ── Overview (README.md) ─────────────────────────────────────────────────────

function buildOverviewMd(docs: Documentation, lang: Lang): string {
  const parts: string[] = []
  parts.push(`# ${docs.overview.title}`)
  parts.push(docs.overview.summary)
  if (docs.overview.analogy) {
    parts.push(`> **${t(lang, 'thinkLikeThis')}** — ${docs.overview.analogy}`)
  }
  parts.push(`## ${t(lang, 'systemArchitecture')}`)
  parts.push(mermaidBlock(docs.overview.architecture))

  parts.push(`## ${t(lang, 'servicesHeader')}`)
  const serviceList = docs.services
    .map((s) => `- [**${s.name}**](./${slugify(s.name)}.md) — ${s.purpose}`)
    .join('\n')
  parts.push(serviceList)

  if (docs.overview.keyConceptsFor.length > 0) {
    parts.push(`## ${t(lang, 'keyConceptsHeader')}`)
    parts.push(t(lang, 'keyConceptsLead'))
    parts.push(docs.overview.keyConceptsFor.map((c) => `- ${c}`).join('\n'))
  }

  parts.push(`## ${t(lang, 'sidebarIntegrations')}`)
  parts.push(t(lang, 'integrationsLink'))

  if (docs.gettingStarted && hasAnyTutorial(docs.gettingStarted)) {
    parts.push(`## ${t(lang, 'gettingStarted')}`)
    const links: string[] = []
    if (docs.gettingStarted.quickStart) links.push(`- [${docs.gettingStarted.quickStart.title}](./getting-started/quick-start.md)`)
    if (docs.gettingStarted.installation) links.push(`- [${docs.gettingStarted.installation.title}](./getting-started/installation.md)`)
    if (docs.gettingStarted.firstProject) links.push(`- [${docs.gettingStarted.firstProject.title}](./getting-started/first-project.md)`)
    if (docs.gettingStarted.troubleshooting) links.push(`- [${docs.gettingStarted.troubleshooting.title}](./getting-started/troubleshooting.md)`)
    parts.push(links.join('\n'))
  }

  parts.push(footer(docs, lang))
  return joinSections(parts)
}

// ── Per-service page ─────────────────────────────────────────────────────────

function buildServiceMd(service: ServiceDoc, lang: Lang): string {
  const parts: string[] = []
  parts.push(`[← ${t(lang, 'breadcrumbHome')}](./README.md)`)
  parts.push(`# ${service.name}`)
  parts.push(`> ${service.purpose}`)
  parts.push(service.longDescription)

  if (service.analogy) {
    parts.push(`> **${t(lang, 'thinkLikeThis')}** — ${service.analogy}`)
  }

  if (service.architecture) {
    parts.push(`## ${t(lang, 'architecture')}`)
    parts.push(mermaidBlock(service.architecture))
  }

  if (service.endpoints.length > 0) {
    parts.push(`## ${t(lang, 'apiEndpoints')}`)
    for (const ep of service.endpoints) {
      parts.push(`### \`${ep.method}\` \`${ep.path}\``)
      parts.push(ep.description)
      if (ep.requestExample) {
        parts.push('**Request:**')
        parts.push(codeBlock('json', ep.requestExample))
      }
      if (ep.responseExample) {
        parts.push('**Response:**')
        parts.push(codeBlock('json', ep.responseExample))
      }
    }
  }

  if (service.events.length > 0) {
    parts.push(`## ${t(lang, 'eventsHeader')}`)
    for (const ev of service.events) {
      parts.push(`### \`${ev.name}\` (${ev.type})`)
      parts.push(ev.description)
      if (ev.payloadExample) parts.push(codeBlock('json', ev.payloadExample))
    }
  }

  if (service.envVars.length > 0) {
    parts.push(`## ${t(lang, 'envVarsHeader')}`)
    const header = `| ${t(lang, 'envVarColName')} | ${t(lang, 'envVarColRequired')} | ${t(lang, 'envVarColDescription')} | ${t(lang, 'envVarColExample')} |`
    const sep = `|---|---|---|---|`
    const rows = service.envVars.map((v) => {
      const req = v.required ? t(lang, 'required') : t(lang, 'optional')
      return `| \`${v.name}\` | ${req} | ${escapeCell(v.description)} | ${v.example ? `\`${escapeCell(v.example)}\`` : ''} |`
    })
    parts.push([header, sep, ...rows].join('\n'))
  }

  if (service.gettingStarted) {
    parts.push(`## ${t(lang, 'gettingStarted')}`)
    parts.push(service.gettingStarted)
  }

  if (service.examples.length > 0) {
    parts.push(`## ${t(lang, 'examples')}`)
    for (const ex of service.examples) {
      parts.push(`### ${ex.title}`)
      parts.push(ex.description)
      parts.push(codeBlock(ex.language || '', ex.code))
    }
  }

  if (service.apiReference) {
    parts.push(buildApiReferenceMd(service.apiReference, lang))
  }

  return joinSections(parts)
}

function buildApiReferenceMd(api: ApiReferenceDoc, lang: Lang): string {
  const parts: string[] = []
  parts.push(`## ${t(lang, 'apiReferenceHeader')}`)
  if (api.intro) parts.push(api.intro)
  for (const section of api.sections) {
    parts.push(`### ${section.title}`)
    if (section.description) parts.push(section.description)
    for (const sym of section.symbols) {
      parts.push(`#### \`${sym.name}\` — ${sym.kind}`)
      if (sym.signature) parts.push(codeBlock('typescript', sym.signature))
      parts.push(sym.description)
      if (sym.params && sym.params.length > 0) {
        parts.push(`**${t(lang, 'parametersLabel')}:**`)
        for (const p of sym.params) {
          const opt = p.required ? '' : ` _(${t(lang, 'optional')})_`
          const def = p.default != null ? ` _(default: \`${p.default}\`)_` : ''
          parts.push(`- \`${p.name}\`${p.type ? ` \`(${p.type})\`` : ''}${opt}${def} — ${p.description}`)
        }
      }
      if (sym.returns) parts.push(`**${t(lang, 'returnsLabel')}:** ${sym.returns}`)
      if (sym.example) parts.push(codeBlock('typescript', sym.example))
      if (sym.sourceFile) parts.push(`_Source: \`${sym.sourceFile}\`_`)
    }
  }
  return joinSections(parts)
}

// ── Integrations ─────────────────────────────────────────────────────────────

function buildIntegrationsMd(integrations: IntegrationDoc, lang: Lang): string {
  const parts: string[] = []
  parts.push(`[← ${t(lang, 'breadcrumbHome')}](./README.md)`)
  parts.push(`# ${t(lang, 'integrationsTitle')}`)
  parts.push(integrations.summary)

  if (integrations.diagram) {
    parts.push(`## ${t(lang, 'systemDiagram')}`)
    parts.push(mermaidBlock(integrations.diagram))
  }

  if (integrations.flows.length > 0) {
    parts.push(`## ${t(lang, 'keyFlowsHeader')}`)
    for (const flow of integrations.flows) {
      parts.push(`### ${flow.name}`)
      parts.push(flow.description)
      if (flow.steps.length > 0) {
        parts.push(flow.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'))
      }
      if (flow.diagram) parts.push(mermaidBlock(flow.diagram))
    }
  }

  return joinSections(parts)
}

// ── Getting started / tutorials ──────────────────────────────────────────────

function hasAnyTutorial(gs: GettingStartedDoc): boolean {
  return !!(gs.quickStart || gs.installation || gs.firstProject || gs.troubleshooting)
}

function buildTutorialMd(tut: TutorialDoc, lang: Lang): string {
  const parts: string[] = []
  parts.push(`[← ${t(lang, 'breadcrumbHome')}](../README.md)`)
  parts.push(`# ${tut.title}`)
  if (tut.summary) parts.push(tut.summary)
  for (const step of tut.steps) {
    parts.push(`## ${step.heading}`)
    parts.push(step.description)
    if (step.code) {
      parts.push(codeBlock(step.code.language || '', step.code.source, step.code.caption))
    }
    if (step.note) {
      const kind = (step.noteKind || 'info').toUpperCase()
      parts.push(`> **${kind}** — ${step.note}`)
    }
  }
  return joinSections(parts)
}

function buildTroubleshootingMd(trb: TroubleshootingDoc, lang: Lang): string {
  const parts: string[] = []
  parts.push(`[← ${t(lang, 'breadcrumbHome')}](../README.md)`)
  parts.push(`# ${trb.title}`)
  if (trb.summary) parts.push(trb.summary)
  for (const item of trb.items) {
    parts.push(`## ${item.problem}`)
    if (item.cause) parts.push(`**${t(lang, 'causeLabel')}:** ${item.cause}`)
    parts.push(item.solution)
    if (item.code) parts.push(codeBlock(item.code.language || 'bash', item.code.source))
  }
  return joinSections(parts)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mermaidBlock(source: string): string {
  // Universal fenced-block — GitHub, GitLab, Obsidian, Notion (with plugin),
  // GitBook, MkDocs+plugin, Docusaurus all render this natively.
  return '```mermaid\n' + source.trim() + '\n```'
}

function codeBlock(lang: string, source: string, caption?: string): string {
  const fence = '```' + (lang || '')
  const block = `${fence}\n${source.trimEnd()}\n\`\`\``
  return caption ? `${caption}\n${block}` : block
}

function escapeCell(s: string): string {
  // Markdown table cells: escape pipes and collapse newlines.
  return s.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
}

function joinSections(parts: string[]): string {
  return parts.filter((p) => p && p.length > 0).join('\n\n') + '\n'
}

function footer(docs: Documentation, lang: Lang): string {
  const when = docs.generatedAt ? new Date(docs.generatedAt).toISOString() : ''
  return `---\n\n_${t(lang, 'footerGenerated')} repomap${when ? ` · ${when}` : ''}_`
}
