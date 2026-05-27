import fs from 'fs'
import path from 'path'
import type {
  ApiReferenceSection,
  CodeGraph,
  Documentation,
  ServiceDoc,
  SymbolDoc,
  TutorialDoc,
  TroubleshootingDoc,
} from '../types.js'
import { t, type Lang } from './i18n.js'
import { getSharedCSS, getFontImports } from './css.js'
import { getMermaidInit } from './mermaid-viewer.js'
import { buildFileTree, renderTreeHTML } from './file-tree.js'

// ─────────────────────────────────────────────────────────────────────────────
// HTML / Markdown / Graphify-dashboard renderers.
// All user-visible strings go through t(lang, key) — no hardcoded English.
// ─────────────────────────────────────────────────────────────────────────────

export function generateHTML(
  docs: Documentation,
  graph: CodeGraph,
  outputPath: string,
  lang: Lang | undefined = 'en'
): void {
  augmentWithReferencedTypes(docs, graph, lang ?? 'en')
  const typeIndex = buildTypeIndex(docs)

  fs.writeFileSync(path.join(outputPath, 'index.html'), buildIndexHTML(docs, lang))

  // Getting Started pages (only render those provided by the LLM)
  if (docs.gettingStarted) {
    const gs = docs.gettingStarted
    const gsDir = path.join(outputPath, 'get-started')
    fs.mkdirSync(gsDir, { recursive: true })
    const pages: Array<{ slug: string; doc: TutorialDoc | TroubleshootingDoc | undefined; kind: 'tutorial' | 'troubleshooting' }> = [
      { slug: 'quick-start',     doc: gs.quickStart,     kind: 'tutorial' },
      { slug: 'installation',    doc: gs.installation,   kind: 'tutorial' },
      { slug: 'first-project',   doc: gs.firstProject,   kind: 'tutorial' },
      { slug: 'troubleshooting', doc: gs.troubleshooting, kind: 'troubleshooting' },
    ]
    for (const p of pages) {
      if (!p.doc) continue
      const subDir = path.join(gsDir, p.slug)
      fs.mkdirSync(subDir, { recursive: true })
      const html = p.kind === 'troubleshooting'
        ? buildTroubleshootingHTML(p.doc as TroubleshootingDoc, p.slug, docs, lang ?? 'en')
        : buildTutorialHTML(p.doc as TutorialDoc, p.slug, docs, lang ?? 'en')
      fs.writeFileSync(path.join(subDir, 'index.html'), html)
    }
  }

  for (const service of docs.services) {
    const serviceDir = path.join(outputPath, slugify(service.name))
    fs.mkdirSync(serviceDir, { recursive: true })
    fs.writeFileSync(path.join(serviceDir, 'index.html'), buildServiceHTML(service, docs, graph, lang))

    if (service.apiReference) {
      const apiDir = path.join(serviceDir, 'api')
      fs.mkdirSync(apiDir, { recursive: true })
      fs.writeFileSync(path.join(apiDir, 'index.html'), buildApiRefHTML(service, docs, lang))

      for (const section of service.apiReference.sections ?? []) {
        const sectionSlug = slugify(section.title)
        const sectionDir = path.join(apiDir, sectionSlug)
        fs.mkdirSync(sectionDir, { recursive: true })
        fs.writeFileSync(
          path.join(sectionDir, 'index.html'),
          buildApiSectionHTML(service, section, docs, lang, typeIndex)
        )
      }
    }
  }

  const intDir = path.join(outputPath, 'integrations')
  fs.mkdirSync(intDir, { recursive: true })
  fs.writeFileSync(path.join(intDir, 'index.html'), buildIntegrationsHTML(docs, graph, lang))

  // Graphify dashboard (fixes the old "Browse graphify outputs" 404)
  const graphifyDir = path.join(outputPath, 'graphify')
  if (fs.existsSync(graphifyDir)) {
    fs.writeFileSync(
      path.join(graphifyDir, 'index.html'),
      buildGraphifyDashboard(docs, graph, lang, graphifyDir)
    )
  }
}

// generateMarkdown lives in ./markdown.ts; re-exported from this module's
// barrel for backwards compatibility with existing imports.
export { generateMarkdown } from './markdown.js'

// ── Index / overview ─────────────────────────────────────────────────────────

function buildIndexHTML(docs: Documentation, lang: Lang): string {
  const serviceCards = docs.services
    .map((s) => `
      <a href="./${slugify(s.name)}/" class="service-card">
        <div class="card-icon">${getServiceIcon(s.name)}</div>
        <div class="card-content">
          <h3>${escapeHTML(s.name)}</h3>
          <p>${escapeHTML(s.purpose)}</p>
        </div>
      </a>`)
    .join('')

  const tocItems: TocItem[] = [
    { id: 'arquitectura', label: t(lang, 'systemArchitecture'), level: 2 },
    { id: 'servicios', label: t(lang, 'servicesHeader'), level: 2 },
  ]
  if (docs.overview.keyConceptsFor.length > 0) {
    tocItems.push({ id: 'conceptos', label: t(lang, 'keyConceptsHeader'), level: 2 })
  }

  return shell({
    lang,
    title: docs.overview.title,
    sidebar: buildSidebar(docs, 'overview', lang, './'),
    tocItems,
    body: `
    <div class="hero">
      <div class="hero-badge">${t(lang, 'badgeDocumentation')}</div>
      <h1>${escapeHTML(docs.overview.title)}</h1>
      <p class="hero-summary">${escapeHTML(docs.overview.summary)}</p>
    </div>

    ${docs.overview.analogy ? `
    <div class="analogy-box">
      <span class="analogy-label">${t(lang, 'thinkLikeThis')}</span>
      <p>${escapeHTML(docs.overview.analogy)}</p>
    </div>` : ''}

    <section class="section" id="arquitectura">
      <h2>${t(lang, 'systemArchitecture')}</h2>
      <div class="mermaid-wrapper">
        <div class="mermaid">${docs.overview.architecture}</div>
      </div>
    </section>

    <section class="section" id="servicios">
      <h2>${t(lang, 'servicesHeader')}</h2>
      <div class="service-grid">${serviceCards}</div>
    </section>

    ${docs.overview.keyConceptsFor.length > 0 ? `
    <section class="section" id="conceptos">
      <h2>${t(lang, 'keyConceptsHeader')}</h2>
      <p>${t(lang, 'keyConceptsLead')}</p>
      <ul class="concepts-list">
        ${docs.overview.keyConceptsFor.map((c) => `<li>${escapeHTML(c)}</li>`).join('')}
      </ul>
    </section>` : ''}

    ${footerHTML(docs, lang)}`,
  })
}

// ── Service page ─────────────────────────────────────────────────────────────

function buildServiceHTML(service: ServiceDoc, docs: Documentation, graph: CodeGraph, lang: Lang): string {
  const endpointsHTML = service.endpoints.length > 0 ? `
    <section class="section" id="endpoints">
      <h2>${t(lang, 'apiEndpoints')}</h2>
      <div class="endpoints">
        ${service.endpoints.map((ep) => `
          <div class="endpoint">
            <div class="endpoint-header">
              <span class="method method-${ep.method.toLowerCase()}">${escapeHTML(ep.method)}</span>
              <code class="endpoint-path">${escapeHTML(ep.path)}</code>
            </div>
            <p>${escapeHTML(ep.description)}</p>
            ${ep.requestExample ? `<pre><code class="language-json">${escapeHTML(ep.requestExample)}</code></pre>` : ''}
          </div>`).join('')}
      </div>
    </section>` : ''

  const examplesHTML = service.examples.length > 0 ? `
    <section class="section" id="ejemplos">
      <h2>${t(lang, 'examples')}</h2>
      ${service.examples.map((ex) => `
        <div class="example-block">
          <h3>${escapeHTML(ex.title)}</h3>
          <p>${escapeHTML(ex.description)}</p>
          <pre><code class="language-${escapeHTML(ex.language)}">${escapeHTML(ex.code)}</code></pre>
        </div>`).join('')}
    </section>` : ''

  // Per-service graphify graph link (if its graph.html was copied over)
  const repoMatch = graph.repos.find((r) => matchService(r.name, service.name))

  const tocItems: TocItem[] = [
    { id: 'arquitectura', label: t(lang, 'architecture'), level: 2 },
    { id: 'empezar', label: t(lang, 'gettingStarted'), level: 2 },
  ]
  if (repoMatch) tocItems.push({ id: 'estructura', label: t(lang, 'fileStructure'), level: 2 })
  if (service.endpoints.length > 0) tocItems.push({ id: 'endpoints', label: t(lang, 'apiEndpoints'), level: 2 })
  if (service.examples.length > 0) tocItems.push({ id: 'ejemplos', label: t(lang, 'examples'), level: 2 })
  if (repoMatch) tocItems.push({ id: 'grafo', label: t(lang, 'knowledgeGraph'), level: 2 })
  if (service.envVars.length > 0) tocItems.push({ id: 'env', label: t(lang, 'envVarsHeader'), level: 2 })
  if (service.apiReference) tocItems.push({ id: 'api-ref-cta', label: t(lang, 'apiReferenceTitle'), level: 2 })

  const fileTreeSection = repoMatch ? `
    <section class="section" id="estructura">
      <h2>${t(lang, 'fileStructure')}</h2>
      ${renderTreeHTML(buildFileTree(repoMatch.path))}
    </section>` : ''

  const graphLink = repoMatch ? `
    <section class="section" id="grafo">
      <h2>${t(lang, 'knowledgeGraph')}</h2>
      <p>${t(lang, 'knowledgeGraphLead')}</p>
      <a class="graph-link" href="../graphify/${encodeURIComponent(repoMatch.name)}/graph.html" target="_blank">
        ${t(lang, 'openGraph')} →
      </a>
    </section>` : ''

  return shell({
    lang,
    title: `${service.name} — ${docs.overview.title}`,
    sidebar: buildSidebar(docs, service.name, lang),
    tocItems,
    body: `
    <div class="page-header">
      <div class="breadcrumb"><a href="../">${t(lang, 'breadcrumbHome')}</a> / ${escapeHTML(service.name)}</div>
      <h1>${escapeHTML(service.name)}</h1>
      <p class="page-subtitle">${escapeHTML(service.purpose)}</p>
    </div>

    ${service.analogy ? `
    <div class="analogy-box">
      <span class="analogy-label">${t(lang, 'analogyLabel')}</span>
      <p>${escapeHTML(service.analogy)}</p>
    </div>` : ''}

    <section class="section">
      <div class="prose"><p>${escapeHTML(service.longDescription).replace(/\n\n/g, '</p><p>')}</p></div>
    </section>

    <section class="section" id="arquitectura">
      <h2>${t(lang, 'architecture')}</h2>
      <div class="mermaid-wrapper">
        <div class="mermaid">${service.architecture}</div>
      </div>
    </section>

    <section class="section" id="empezar">
      <h2>${t(lang, 'gettingStarted')}</h2>
      <pre><code>${escapeHTML(service.gettingStarted)}</code></pre>
    </section>

    ${fileTreeSection}
    ${endpointsHTML}
    ${examplesHTML}
    ${graphLink}

    ${service.envVars.length > 0 ? `
    <section class="section" id="env">
      <h2>${t(lang, 'envVarsHeader')}</h2>
      <table class="env-table">
        <thead><tr>
          <th>${t(lang, 'envVarColName')}</th>
          <th>${t(lang, 'envVarColRequired')}</th>
          <th>${t(lang, 'envVarColDescription')}</th>
          <th>${t(lang, 'envVarColExample')}</th>
        </tr></thead>
        <tbody>
          ${service.envVars.map((v) => `
          <tr>
            <td><code>${escapeHTML(v.name)}</code></td>
            <td>${v.required
              ? `<span class="badge required">${t(lang, 'required')}</span>`
              : `<span class="badge optional">${t(lang, 'optional')}</span>`}</td>
            <td>${escapeHTML(v.description)}</td>
            <td><code>${escapeHTML(v.example ?? '—')}</code></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>` : ''}

    ${service.apiReference ? `
    <section class="section" id="api-ref-cta">
      <h2>${t(lang, 'apiReferenceTitle')}</h2>
      ${service.apiReference.intro ? `<p class="api-ref-intro">${escapeHTML(service.apiReference.intro)}</p>` : ''}
      <a class="graph-link" href="./api/">${t(lang, 'apiReferenceTitle')} →</a>
    </section>` : ''}

    ${footerHTML(docs, lang)}`,
  })
}

// ── API Reference page ────────────────────────────────────────────────────────

function buildApiRefHTML(service: ServiceDoc, docs: Documentation, lang: Lang): string {
  const ref = service.apiReference!
  const sections = ref.sections ?? []

  const cardsHTML = sections.map((section) => {
    const slug = slugify(section.title)
    const count = (section.symbols ?? []).length
    const noun = count === 1 ? t(lang, 'apiRefSymbolOne') : t(lang, 'apiRefSymbolMany')
    return `
    <a href="./${slug}/" class="service-card api-section-card">
      <div class="card-icon">§</div>
      <div class="card-content">
        <h3>${escapeHTML(section.title)}</h3>
        ${section.description ? `<p>${escapeHTML(section.description)}</p>` : ''}
        <span class="card-meta">${count} ${noun}</span>
      </div>
    </a>`
  }).join('')

  const tocHTML = sections.length === 0 ? '' : `
  <aside class="toc">
    <div class="toc-label">${t(lang, 'onThisPage')}</div>
    <ol class="toc-numbered">
      ${sections.map((section, idx) => {
        const slug = slugify(section.title)
        const idx2 = String(idx + 1).padStart(2, '0')
        const count = (section.symbols ?? []).length
        return `<li><a href="./${slug}/">
          <span class="toc-num">${idx2}</span>
          <span class="toc-num-label">${escapeHTML(section.title)}</span>
          <span class="toc-num-meta">${count}</span>
        </a></li>`
      }).join('')}
    </ol>
  </aside>`

  return shell({
    lang,
    title: `${service.name} — ${t(lang, 'apiReferenceTitle')} — ${docs.overview.title}`,
    sidebar: buildSidebar(docs, `api:${service.name}`, lang, '../../'),
    tocHTML,
    body: `
    <div class="page-header">
      <div class="breadcrumb">
        <a href="../../">${t(lang, 'breadcrumbHome')}</a> /
        <a href="../">${escapeHTML(service.name)}</a> /
        ${t(lang, 'apiReferenceTitle')}
      </div>
      <h1>${escapeHTML(service.name)} — ${t(lang, 'apiReferenceTitle')}</h1>
      ${ref.intro ? `<p class="page-subtitle">${escapeHTML(ref.intro)}</p>` : ''}
    </div>

    ${sections.length === 0
      ? `<p class="symbol-section-intro">${t(lang, 'apiRefNoSymbols')}</p>`
      : `
    <section class="section">
      <p class="api-sections-lead">${t(lang, 'apiRefBrowseSections')}</p>
      <div class="service-grid">${cardsHTML}</div>
    </section>`}

    ${footerHTML(docs, lang)}`,
  })
}

function buildApiSectionHTML(
  service: ServiceDoc,
  section: ApiReferenceSection,
  docs: Documentation,
  lang: Lang,
  typeIndex: TypeIndex
): string {
  const sectionSlug = slugify(section.title)
  const symbols = section.symbols ?? []
  const current: SymbolLocation = {
    serviceSlug: slugify(service.name),
    sectionSlug,
    symbolSlug: '',
  }

  const tocHTML = `
  <aside class="toc">
    <div class="toc-label">${t(lang, 'onThisPage')}</div>
    <ul class="toc-symbol-list">
      ${symbols.length === 0
        ? `<li class="toc-empty">${t(lang, 'apiRefNoSymbols')}</li>`
        : symbols.map((sym) => `
        <li>
          <a href="#sym-${slugify(sym.name)}" data-toc-id="sym-${slugify(sym.name)}">
            <span class="toc-sym-kind toc-sym-kind-${sym.kind}">${kindGlyph(sym.kind)}</span>
            <span class="toc-sym-name">${escapeHTML(sym.name)}</span>
          </a>
        </li>`).join('')}
    </ul>
  </aside>`

  return shell({
    lang,
    title: `${section.title} — ${service.name} — ${t(lang, 'apiReferenceTitle')} — ${docs.overview.title}`,
    sidebar: buildSidebar(docs, `api:${service.name}:${sectionSlug}`, lang, '../../../'),
    tocHTML,
    body: `
    <div class="page-header">
      <div class="breadcrumb">
        <a href="../../../">${t(lang, 'breadcrumbHome')}</a> /
        <a href="../../">${escapeHTML(service.name)}</a> /
        <a href="../">${t(lang, 'apiReferenceTitle')}</a> /
        ${escapeHTML(section.title)}
      </div>
      <h1>${escapeHTML(section.title)}</h1>
      ${section.description ? `<p class="page-subtitle">${escapeHTML(section.description)}</p>` : ''}
    </div>

    <section class="section">
      ${symbols.length === 0
        ? `<p class="symbol-section-intro">${t(lang, 'apiRefNoSymbols')}</p>`
        : symbols.map((sym) => renderSymbolCard(sym, lang, typeIndex, current)).join('')}
    </section>

    ${footerHTML(docs, lang)}`,
  })
}

// ── Type cross-linking ──────────────────────────────────────────────────────
// Build a global { TypeName → location } index and linkify type strings so a
// reader can click `RepoConfig` in a param table and jump to its symbol card.

interface SymbolLocation {
  serviceSlug: string
  sectionSlug: string
  symbolSlug: string
}

type TypeIndex = Map<string, SymbolLocation>

function buildTypeIndex(docs: Documentation): TypeIndex {
  const idx: TypeIndex = new Map()
  for (const service of docs.services) {
    const serviceSlug = slugify(service.name)
    for (const section of service.apiReference?.sections ?? []) {
      const sectionSlug = slugify(section.title)
      for (const sym of section.symbols ?? []) {
        if (idx.has(sym.name)) continue
        idx.set(sym.name, { serviceSlug, sectionSlug, symbolSlug: slugify(sym.name) })
      }
    }
  }
  return idx
}

function resolveSymbolHref(current: SymbolLocation, target: SymbolLocation): string {
  if (current.serviceSlug === target.serviceSlug && current.sectionSlug === target.sectionSlug) {
    return `#sym-${target.symbolSlug}`
  }
  if (current.serviceSlug === target.serviceSlug) {
    return `../${target.sectionSlug}/#sym-${target.symbolSlug}`
  }
  return `../../../${target.serviceSlug}/api/${target.sectionSlug}/#sym-${target.symbolSlug}`
}

function linkifyType(typeStr: string, index: TypeIndex, current: SymbolLocation): string {
  const tokenRe = /([A-Za-z_$][A-Za-z0-9_$]*)/g
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(typeStr)) !== null) {
    const tok = m[1]
    const start = m.index
    if (start > last) out += escapeHTML(typeStr.slice(last, start))
    const target = index.get(tok)
    if (target) {
      const href = resolveSymbolHref(current, target)
      out += `<a class="type-link" href="${href}">${escapeHTML(tok)}</a>`
    } else {
      out += escapeHTML(tok)
    }
    last = start + tok.length
  }
  if (last < typeStr.length) out += escapeHTML(typeStr.slice(last))
  return out
}

// ── Source-extracted type stubs ─────────────────────────────────────────────
// The LLM doesn't always document every composite type referenced in params.
// We bridge that gap by reading the .ts source for any referenced-but-undocumented
// type and synthesizing a SymbolDoc so it shows up in the rendered docs (and
// becomes linkable via the type cross-link system). Zero LLM tokens involved.

function extractTypeDefinition(absFile: string, line1Indexed: number): string | null {
  let text: string
  try {
    text = fs.readFileSync(absFile, 'utf8')
  } catch {
    return null
  }
  const lines = text.split('\n')
  if (line1Indexed <= 0 || line1Indexed > lines.length) return null
  const start = line1Indexed - 1

  let braceDepth = 0
  let parenDepth = 0
  let bracketDepth = 0
  let openedBrace = false
  const captured: string[] = []

  for (let i = start; i < Math.min(lines.length, start + 100); i++) {
    const l = lines[i]
    captured.push(l)
    for (const ch of l) {
      if (ch === '{') { braceDepth++; openedBrace = true }
      else if (ch === '}') braceDepth--
      else if (ch === '(') parenDepth++
      else if (ch === ')') parenDepth--
      else if (ch === '[') bracketDepth++
      else if (ch === ']') bracketDepth--
    }
    const allClosed = braceDepth === 0 && parenDepth === 0 && bracketDepth === 0
    if (openedBrace && allClosed) break
    if (!openedBrace && allClosed) {
      const stripped = l.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '').trim()
      if (stripped.endsWith(';')) break
    }
  }
  return captured.join('\n').replace(/\s+$/, '')
}

function augmentWithReferencedTypes(docs: Documentation, graph: CodeGraph, lang: Lang): void {
  // 1. Collect PascalCase identifiers referenced in params / returns.
  const referenced = new Set<string>()
  const harvest = (s: string | undefined | null) => {
    if (!s) return
    const re = /([A-Z][A-Za-z0-9_$]*)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) !== null) referenced.add(m[1])
  }
  for (const svc of docs.services) {
    for (const section of svc.apiReference?.sections ?? []) {
      for (const sym of section.symbols ?? []) {
        for (const p of sym.params ?? []) harvest(p.type)
        harvest(sym.returns)
      }
    }
  }
  if (referenced.size === 0) return

  // 2. Set of names already documented by the LLM.
  const documented = new Set<string>()
  for (const svc of docs.services) {
    for (const section of svc.apiReference?.sections ?? []) {
      for (const sym of section.symbols ?? []) documented.add(sym.name)
    }
  }

  // 3. Source-index: name → location pulled from static scanner output.
  const sourceIdx = new Map<string, { repoName: string; absFile: string; relFile: string; line: number; kind: string }>()
  for (const repo of graph.repos) {
    const repoAbs = path.resolve(repo.path)
    for (const fe of repo.exportedSymbols ?? []) {
      for (const sym of fe.symbols) {
        if (sym.kind !== 'interface' && sym.kind !== 'type' && sym.kind !== 'enum') continue
        if (sourceIdx.has(sym.name)) continue
        sourceIdx.set(sym.name, {
          repoName: repo.name,
          absFile: path.join(repoAbs, fe.file),
          relFile: fe.file,
          line: sym.line,
          kind: sym.kind === 'enum' ? 'type' : sym.kind,
        })
      }
    }
  }

  // 4. Synthesize stub SymbolDocs for missing-but-source-known types.
  const synthBySvc = new Map<string, SymbolDoc[]>()
  for (const name of referenced) {
    if (documented.has(name)) continue
    const entry = sourceIdx.get(name)
    if (!entry) continue
    const svc = docs.services.find((s) => matchService(entry.repoName, s.name))
    if (!svc) continue
    const defn = extractTypeDefinition(entry.absFile, entry.line)
    if (!defn) continue
    const stub: SymbolDoc = {
      name,
      kind: entry.kind as SymbolDoc['kind'],
      signature: defn,
      description: lang === 'es'
        ? 'Definición extraída del código fuente.'
        : 'Pulled from source code.',
      sourceFile: entry.relFile,
    }
    const list = synthBySvc.get(svc.name) ?? []
    list.push(stub)
    synthBySvc.set(svc.name, list)
  }

  // 5. Append a "Tipos referenciados" / "Referenced types" section per service.
  for (const svc of docs.services) {
    const stubs = synthBySvc.get(svc.name)
    if (!stubs || stubs.length === 0) continue
    if (!svc.apiReference) continue
    stubs.sort((a, b) => a.name.localeCompare(b.name))
    svc.apiReference.sections.push({
      title: lang === 'es' ? 'Tipos referenciados' : 'Referenced types',
      description: lang === 'es'
        ? 'Tipos compuestos extraídos del código fuente. Aparecen referenciados en parámetros o retornos pero no fueron documentados directamente por el modelo.'
        : 'Composite types pulled from source. They appear in params or returns but were not directly documented by the model.',
      symbols: stubs,
    })
  }
}

// ── Getting Started pages ────────────────────────────────────────────────────

function buildTutorialHTML(
  tutorial: TutorialDoc,
  slug: string,
  docs: Documentation,
  lang: Lang
): string {
  const steps = tutorial.steps ?? []
  const tocItems: TocItem[] = steps.map((s, i) => ({
    id: `step-${i + 1}`,
    label: s.heading,
    level: 2,
  }))

  const sidebarLabel = sidebarGsLabel(slug, lang)

  const body = `
    <div class="page-header">
      <div class="breadcrumb">
        <a href="../../">${t(lang, 'breadcrumbHome')}</a> /
        ${t(lang, 'sidebarGetStarted')} /
        ${escapeHTML(sidebarLabel)}
      </div>
      <h1>${escapeHTML(tutorial.title || sidebarLabel)}</h1>
      ${tutorial.summary ? `<p class="page-subtitle">${escapeHTML(tutorial.summary)}</p>` : ''}
    </div>

    ${steps.length === 0 ? `<p class="symbol-section-intro">—</p>` : steps.map((step, i) => {
      const idx = i + 1
      const id = `step-${idx}`
      const cleanHeading = (step.heading ?? '').replace(/^\s*\d+[.)]\s+/, '')
      return `
      <section class="section tutorial-step" id="${id}">
        <header class="tutorial-step-head">
          <span class="tutorial-step-marker">${String(idx).padStart(2, '0')}</span>
          <h2>${escapeHTML(cleanHeading)}</h2>
        </header>
        ${renderProse(step.description)}
        ${step.code ? renderTutorialCode(step.code) : ''}
        ${step.note ? renderTutorialNote(step.note, step.noteKind ?? 'info', lang) : ''}
      </section>`
    }).join('')}

    ${footerHTML(docs, lang)}`

  return shell({
    lang,
    title: `${tutorial.title || sidebarLabel} — ${docs.overview.title}`,
    sidebar: buildSidebar(docs, `gs:${slug}`, lang, '../../'),
    tocItems,
    body,
  })
}

function buildTroubleshootingHTML(
  ts: TroubleshootingDoc,
  slug: string,
  docs: Documentation,
  lang: Lang
): string {
  const items = ts.items ?? []
  const tocItems: TocItem[] = items.map((it, i) => ({
    id: `issue-${i + 1}`,
    label: it.problem,
    level: 2,
  }))

  const sidebarLabel = t(lang, 'sidebarTroubleshooting')

  const body = `
    <div class="page-header">
      <div class="breadcrumb">
        <a href="../../">${t(lang, 'breadcrumbHome')}</a> /
        ${t(lang, 'sidebarGetStarted')} /
        ${escapeHTML(sidebarLabel)}
      </div>
      <h1>${escapeHTML(ts.title || sidebarLabel)}</h1>
      ${ts.summary ? `<p class="page-subtitle">${escapeHTML(ts.summary)}</p>` : ''}
    </div>

    ${items.length === 0 ? `<p class="symbol-section-intro">—</p>` : `
    <section class="section troubleshooting-list">
      ${items.map((it, i) => {
        const id = `issue-${i + 1}`
        return `
        <article class="troubleshoot-item" id="${id}">
          <header class="troubleshoot-head">
            <span class="troubleshoot-label">${t(lang, 'troubleshootingProblem')}</span>
            <h2 class="troubleshoot-problem">${escapeHTML(it.problem)}</h2>
          </header>
          ${it.cause ? `
          <div class="troubleshoot-cause">
            <div class="troubleshoot-sub-label">${t(lang, 'troubleshootingCause')}</div>
            <p>${escapeHTML(it.cause)}</p>
          </div>` : ''}
          <div class="troubleshoot-solution">
            <div class="troubleshoot-sub-label">${t(lang, 'troubleshootingSolution')}</div>
            ${renderProse(it.solution)}
            ${it.code ? renderTutorialCode(it.code) : ''}
          </div>
        </article>`
      }).join('')}
    </section>`}

    ${footerHTML(docs, lang)}`

  return shell({
    lang,
    title: `${ts.title || sidebarLabel} — ${docs.overview.title}`,
    sidebar: buildSidebar(docs, `gs:${slug}`, lang, '../../'),
    tocItems,
    body,
  })
}

function renderProse(text: string): string {
  if (!text) return ''
  return text
    .split(/\n\n+/)
    .map((p) => `<p>${escapeHTML(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

function renderTutorialCode(code: { language: string; source: string; caption?: string }): string {
  return `
    <div class="tutorial-code-wrap">
      ${code.caption ? `<div class="tutorial-code-caption">${escapeHTML(code.caption)}</div>` : ''}
      <pre><code class="language-${escapeHTML(code.language || 'plaintext')}">${escapeHTML(code.source)}</code></pre>
    </div>`
}

function renderTutorialNote(text: string, kind: 'tip' | 'warning' | 'info', lang: Lang): string {
  const labelKey = kind === 'tip' ? 'tutorialNoteTip' : kind === 'warning' ? 'tutorialNoteWarning' : 'tutorialNoteInfo'
  return `
    <aside class="tutorial-note tutorial-note-${kind}">
      <span class="tutorial-note-label">${t(lang, labelKey)}</span>
      <p>${escapeHTML(text)}</p>
    </aside>`
}

function sidebarGsLabel(slug: string, lang: Lang): string {
  switch (slug) {
    case 'quick-start':     return t(lang, 'sidebarQuickStart')
    case 'installation':    return t(lang, 'sidebarInstallation')
    case 'first-project':   return t(lang, 'sidebarFirstProject')
    case 'troubleshooting': return t(lang, 'sidebarTroubleshooting')
    default: return slug
  }
}

function kindGlyph(kind: SymbolDoc['kind']): string {
  switch (kind) {
    case 'function': return 'ƒ'
    case 'class':    return 'C'
    case 'interface':return 'I'
    case 'type':     return 'T'
    case 'variable': return 'V'
    case 'constant': return 'K'
    case 'method':   return 'M'
    default:         return '·'
  }
}

function renderSymbolCard(
  sym: SymbolDoc,
  lang: Lang,
  typeIndex?: TypeIndex,
  current?: SymbolLocation
): string {
  const kindClass = `symbol-kind-${sym.kind}`
  const anchorId = `sym-${slugify(sym.name)}`
  const renderType = (s: string | undefined | null): string => {
    if (s == null || s === '') return '—'
    if (typeIndex && current) return linkifyType(s, typeIndex, current)
    return escapeHTML(s)
  }

  const paramsHTML = sym.params && sym.params.length > 0 ? `
    <div class="symbol-section-label">${t(lang, 'apiRefParameters')}</div>
    <table class="params-table">
      <thead><tr>
        <th>${t(lang, 'apiRefParamName')}</th>
        <th>${t(lang, 'apiRefParamType')}</th>
        <th>${t(lang, 'apiRefParamRequired')}</th>
        <th>${t(lang, 'apiRefParamDescription')}</th>
        ${sym.params.some((p) => p.default != null) ? `<th>${t(lang, 'apiRefParamDefault')}</th>` : ''}
      </tr></thead>
      <tbody>
        ${sym.params.map((p) => `
        <tr>
          <td><code>${escapeHTML(p.name)}</code></td>
          <td><code>${renderType(p.type)}</code></td>
          <td><span class="${p.required ? 'param-req' : 'param-opt'}">${p.required ? '✓' : '—'}</span></td>
          <td>${escapeHTML(p.description)}</td>
          ${sym.params!.some((q) => q.default != null) ? `<td><code>${escapeHTML(p.default ?? '—')}</code></td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>` : ''

  const returnsHTML = sym.returns ? `
    <div class="symbol-returns">
      <strong>${t(lang, 'apiRefReturns')}</strong>
      ${renderType(sym.returns)}
    </div>` : ''

  const exampleHTML = sym.example ? `
    <div class="symbol-example">
      <pre><code class="language-typescript">${escapeHTML(sym.example)}</code></pre>
    </div>` : ''

  return `
  <div class="symbol-card" id="${anchorId}">
    <div class="symbol-header">
      <span class="symbol-kind ${kindClass}">${escapeHTML(sym.kind)}</span>
      <code class="symbol-name">${escapeHTML(sym.name)}</code>
      ${sym.sourceFile ? `<span class="symbol-file">${escapeHTML(sym.sourceFile)}</span>` : ''}
    </div>
    <div class="symbol-body">
      ${sym.signature ? `<pre class="symbol-signature">${escapeHTML(sym.signature)}</pre>` : ''}
      <p class="symbol-description">${escapeHTML(sym.description)}</p>
      ${paramsHTML}
      ${returnsHTML}
      ${exampleHTML}
    </div>
  </div>`
}

// ── Integrations ─────────────────────────────────────────────────────────────

function buildIntegrationsHTML(docs: Documentation, graph: CodeGraph, lang: Lang): string {
  const httpRelationsHTML = graph.httpRelations.length > 0 ? `
    <section class="section" id="http">
      <h2>${t(lang, 'httpConnectionsHeader')}</h2>
      <p>${t(lang, 'httpConnectionsLead')}</p>
      <table class="env-table">
        <thead><tr>
          <th>${t(lang, 'httpColFrom')}</th>
          <th>${t(lang, 'httpColTo')}</th>
          <th>${t(lang, 'httpColMethod')}</th>
          <th>${t(lang, 'httpColUrl')}</th>
          <th>${t(lang, 'httpColEvidence')}</th>
        </tr></thead>
        <tbody>
          ${graph.httpRelations.map((r) => `
          <tr>
            <td><strong>${escapeHTML(r.from)}</strong></td>
            <td><strong>${escapeHTML(r.to)}</strong></td>
            <td><code>${escapeHTML(r.method ?? '—')}</code></td>
            <td><code>${escapeHTML(r.url)}</code></td>
            <td><span class="badge evidence">${escapeHTML(r.evidence)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </section>` : ''

  const graphifyCTA = `
    <section class="section" id="grafo-interactivo">
      <h2>${t(lang, 'interactiveGraphHeader')}</h2>
      <p>${t(lang, 'interactiveGraphLead')}</p>
      <a class="graph-link" href="../graphify/" target="_blank">
        ${t(lang, 'browseGraphifyOutputs')} →
      </a>
    </section>`

  const tocItems: TocItem[] = [
    { id: 'diagrama', label: t(lang, 'systemDiagram'), level: 2 },
  ]
  if (graph.httpRelations.length > 0) {
    tocItems.push({ id: 'http', label: t(lang, 'httpConnectionsHeader'), level: 2 })
  }
  tocItems.push({ id: 'flujos', label: t(lang, 'keyFlowsHeader'), level: 2 })
  tocItems.push({ id: 'grafo-interactivo', label: t(lang, 'interactiveGraphHeader'), level: 2 })

  return shell({
    lang,
    title: `${t(lang, 'integrationsTitle')} — ${docs.overview.title}`,
    sidebar: buildSidebar(docs, 'integrations', lang),
    tocItems,
    body: `
    <div class="page-header">
      <div class="breadcrumb"><a href="../">${t(lang, 'breadcrumbHome')}</a> / ${t(lang, 'sidebarIntegrations')}</div>
      <h1>${t(lang, 'integrationsTitle')}</h1>
      <p class="page-subtitle">${escapeHTML(docs.integrations.summary)}</p>
    </div>

    <section class="section" id="diagrama">
      <h2>${t(lang, 'systemDiagram')}</h2>
      <div class="mermaid-wrapper">
        <div class="mermaid">${docs.integrations.diagram}</div>
      </div>
    </section>

    ${httpRelationsHTML}

    <section class="section" id="flujos">
      <h2>${t(lang, 'keyFlowsHeader')}</h2>
      ${docs.integrations.flows.length === 0 ? `<p class="prose">${t(lang, 'noFlows')}</p>` : ''}
      ${docs.integrations.flows.map((flow) => `
      <div class="flow-block">
        <h3>${escapeHTML(flow.name)}</h3>
        <p>${escapeHTML(flow.description)}</p>
        <ol class="flow-steps">
          ${flow.steps.map((step) => `<li>${escapeHTML(step)}</li>`).join('')}
        </ol>
        <div class="mermaid-wrapper">
          <div class="mermaid">${flow.diagram}</div>
        </div>
      </div>`).join('')}
    </section>

    ${graphifyCTA}

    ${footerHTML(docs, lang)}`,
  })
}

// ── Graphify dashboard (fixes the 404) ──────────────────────────────────────

function buildGraphifyDashboard(docs: Documentation, graph: CodeGraph, lang: Lang, graphifyDir: string): string {
  const reposWithHtml = graph.repos.filter((r) =>
    fs.existsSync(path.join(graphifyDir, r.name, 'graph.html'))
  )

  const perRepoCards = reposWithHtml
    .map((r) => `
        <a href="./${encodeURIComponent(r.name)}/graph.html" target="_blank" class="service-card">
          <div class="card-icon">⌬</div>
          <div class="card-content">
            <h3>${escapeHTML(r.name)}</h3>
            <p>${t(lang, 'open')} graph.html →</p>
          </div>
        </a>`)
    .join('')

  return shell({
    lang,
    title: `${t(lang, 'browseGraphifyOutputs')} — ${docs.overview.title}`,
    sidebar: buildSidebar(docs, 'integrations', lang, '../'),
    body: `
    <div class="page-header">
      <div class="breadcrumb"><a href="../">${t(lang, 'breadcrumbHome')}</a> / ${t(lang, 'browseGraphifyOutputs')}</div>
      <h1>${t(lang, 'browseGraphifyOutputs')}</h1>
      <p class="page-subtitle">${t(lang, 'interactiveGraphLead')}</p>
    </div>

    <section class="section">
      <h2>${t(lang, 'crossRepoGraph')}</h2>
      <a class="graph-link" href="./cross-repo-graph.json" download>
        ${t(lang, 'downloadJson')} (cross-repo-graph.json) ↓
      </a>
    </section>

    <section class="section">
      <h2>${t(lang, 'perRepoGraphs')}</h2>
      <div class="service-grid">${perRepoCards}</div>
    </section>

    ${footerHTML(docs, lang)}`,
  })
}

// ── Shared shell ────────────────────────────────────────────────────────────

interface ShellOpts {
  lang: Lang
  title: string
  sidebar: string
  body: string
  tocItems?: TocItem[]
  tocHTML?: string
  extraScripts?: string
}

export interface TocItem {
  id: string
  label: string
  level: 2 | 3
}

function shell({ lang, title, sidebar, body, tocItems = [], tocHTML, extraScripts = '' }: ShellOpts): string {
  let toc = ''
  if (tocHTML) {
    toc = tocHTML
  } else if (tocItems.length > 0) {
    toc = `
  <aside class="toc">
    <div class="toc-label">${t(lang, 'onThisPage')}</div>
    <ul>
      ${tocItems.map((item) => item.level === 2
        ? `<li><a href="#${item.id}" data-toc-id="${item.id}">${escapeHTML(item.label)}</a></li>`
        : `<li class="toc-sub"><a href="#${item.id}" data-toc-id="${item.id}">${escapeHTML(item.label)}</a></li>`
      ).join('')}
    </ul>
  </aside>`
  }

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)}</title>
  ${getThemeInitScript()}
  ${getFontImports()}
  ${getSharedCSS()}
</head>
<body>
  ${sidebar}
  <main class="main-content">
    <div class="content-inner">
      ${body}
    </div>
  </main>
  ${toc}
  ${getMermaidInit(lang)}
  ${getTocScrollSpy()}
  ${getSidebarDropdown()}
  ${getThemeSwitcherScript()}
  ${extraScripts}
  ${getCodeBlockEnhancer(lang)}
</body>
</html>`
}

// Sync script in <head> that resolves the theme BEFORE CSS paints so the
// page doesn't flash the wrong palette. Reads localStorage 'repomap-theme'
// (null|"system" → use prefers-color-scheme).
function getThemeInitScript(): string {
  return `<script>
(function () {
  try {
    var pref = localStorage.getItem('repomap-theme')
    var resolved = (pref === 'light' || pref === 'dark')
      ? pref
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.setAttribute('data-theme-pref', pref || 'system')
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light')
    document.documentElement.setAttribute('data-theme-pref', 'system')
  }
})()
</script>`
}

function getThemeSwitcherScript(): string {
  return `<script>
(function () {
  var root = document.documentElement
  var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
  var buttons = document.querySelectorAll('.theme-switcher button[data-theme-set]')
  if (buttons.length === 0) return

  function resolve(pref) {
    if (pref === 'light' || pref === 'dark') return pref
    return mql && mql.matches ? 'dark' : 'light'
  }
  function apply(pref) {
    var theme = resolve(pref)
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-theme-pref', pref)
    try {
      if (pref === 'system') localStorage.removeItem('repomap-theme')
      else localStorage.setItem('repomap-theme', pref)
    } catch (e) {}
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === pref))
    })
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme, pref: pref } }))
  }

  var initial = root.getAttribute('data-theme-pref') || 'system'
  buttons.forEach(function (b) {
    b.setAttribute('aria-pressed', String(b.dataset.themeSet === initial))
    b.addEventListener('click', function () { apply(b.dataset.themeSet) })
  })

  if (mql) {
    var onChange = function () {
      if ((root.getAttribute('data-theme-pref') || 'system') === 'system') apply('system')
    }
    if (mql.addEventListener) mql.addEventListener('change', onChange)
    else if (mql.addListener) mql.addListener(onChange)
  }
})()
</script>`
}

function getSidebarDropdown(): string {
  return `<script>
(function () {
  document.querySelectorAll('.sidebar-api-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      const group = btn.closest('.sidebar-api-group')
      if (!group) return
      const willOpen = !group.classList.contains('open')
      group.classList.toggle('open', willOpen)
      btn.setAttribute('aria-expanded', String(willOpen))
    })
  })
})()
</script>`
}

function getCodeBlockEnhancer(lang: Lang): string {
  const copyLabel = lang === 'es' ? 'Copiar' : 'Copy'
  const copiedLabel = lang === 'es' ? '¡Copiado!' : 'Copied!'
  return `<script src="https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js"></script>
<script>
(function () {
  if (typeof hljs === 'undefined') return
  document.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement
    if (!pre || pre.closest('.code-block')) return

    // Try to apply syntax highlighting
    try { hljs.highlightElement(code) } catch (e) { /* unsupported language */ }

    // Derive language label
    let langLabel = ''
    code.classList.forEach((c) => {
      if (c.startsWith('language-')) langLabel = c.slice('language-'.length)
      if (c.startsWith('hljs-language-')) langLabel = c.slice('hljs-language-'.length)
    })
    if (!langLabel && code.dataset.highlighted === 'yes') {
      const detected = [...code.classList].find((c) => c !== 'hljs' && !c.startsWith('language-'))
      if (detected) langLabel = detected
    }

    // Wrap with .code-block + header + copy button
    const wrap = document.createElement('div')
    wrap.className = 'code-block'
    const header = document.createElement('div')
    header.className = 'code-block-header'
    header.innerHTML = '<span class="code-block-lang">' + (langLabel || 'code') + '</span>' +
      '<button type="button" class="code-block-copy" aria-label="${copyLabel}">' +
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">' +
          '<rect x="5" y="5" width="9" height="9" rx="1.5"/>' +
          '<path d="M11 5V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h2"/>' +
        '</svg>' +
        '<span>${copyLabel}</span>' +
      '</button>'
    pre.parentNode.insertBefore(wrap, pre)
    wrap.appendChild(header)
    wrap.appendChild(pre)

    const btn = header.querySelector('.code-block-copy')
    const label = btn.querySelector('span')
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent || '')
        btn.classList.add('copied')
        label.textContent = '${copiedLabel}'
        setTimeout(() => {
          btn.classList.remove('copied')
          label.textContent = '${copyLabel}'
        }, 1500)
      } catch (e) {
        label.textContent = '✗'
      }
    })
  })
})()
</script>`
}

function getTocScrollSpy(): string {
  return `<script>
(function () {
  const links = document.querySelectorAll('.toc a[data-toc-id]')
  if (links.length === 0) return
  const byId = new Map()
  links.forEach((a) => byId.set(a.dataset.tocId, a))
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const id = entry.target.id
      const link = byId.get(id)
      if (!link) return
      if (entry.isIntersecting) {
        links.forEach((l) => l.classList.remove('active'))
        link.classList.add('active')
      }
    })
  }, { rootMargin: '-15% 0px -70% 0px', threshold: 0 })
  byId.forEach((_link, id) => {
    const el = document.getElementById(id)
    if (el) observer.observe(el)
  })
})()
</script>`
}

function buildSidebar(docs: Documentation, active: string, lang: Lang, relRoot = '../'): string {
  // active forms:
  //   'overview' | 'integrations' | <service-name>
  //   'api:<service-name>'                       (API ref landing)
  //   'api:<service-name>:<section-slug>'        (one API section page)
  //   'gs:<slug>'                                 (a Get Started tutorial page)
  let activeApiService: string | null = null
  let activeApiSection: string | null = null
  let activeGs: string | null = null
  if (active.startsWith('api:')) {
    const rest = active.slice(4)
    const sep = rest.indexOf(':')
    if (sep === -1) {
      activeApiService = rest
    } else {
      activeApiService = rest.slice(0, sep)
      activeApiSection = rest.slice(sep + 1)
    }
  } else if (active.startsWith('gs:')) {
    activeGs = active.slice(3)
  }

  // Get Started section (only render if the LLM provided gettingStarted data)
  const gs = docs.gettingStarted
  const gsLinks: Array<{ slug: string; label: string }> = []
  if (gs?.quickStart)     gsLinks.push({ slug: 'quick-start',     label: t(lang, 'sidebarQuickStart') })
  if (gs?.installation)   gsLinks.push({ slug: 'installation',    label: t(lang, 'sidebarInstallation') })
  if (gs?.firstProject)   gsLinks.push({ slug: 'first-project',   label: t(lang, 'sidebarFirstProject') })
  if (gs?.troubleshooting) gsLinks.push({ slug: 'troubleshooting', label: t(lang, 'sidebarTroubleshooting') })
  const gsHTML = gsLinks.length === 0 ? '' : `
    <div class="sidebar-section">
      <div class="sidebar-label">${t(lang, 'sidebarGetStarted')}</div>
      ${gsLinks.map((g) => {
        const isActive = activeGs === g.slug
        return `<a href="${relRoot}get-started/${g.slug}/" class="sidebar-link${isActive ? ' active' : ''}">${escapeHTML(g.label)}</a>`
      }).join('')}
    </div>`

  const serviceLinks = docs.services
    .map((s) => {
      const isActive = s.name === active
      return `<a href="${relRoot}${slugify(s.name)}/" class="sidebar-link ${isActive ? 'active' : ''}">${escapeHTML(s.name)}</a>`
    })
    .join('')

  const apiRefServices = docs.services.filter((s) => s.apiReference)
  const hasAnyApiRef = apiRefServices.length > 0

  const apiRefGroups = apiRefServices.map((s) => {
    const isActiveService = activeApiService === s.name
    const slug = slugify(s.name)
    const apiHref = `${relRoot}${slug}/api/`
    const sections = s.apiReference?.sections ?? []
    const expanded = isActiveService

    const sectionItems = sections.map((section, idx) => {
      const sectionSlug = slugify(section.title)
      const href = `${apiHref}${sectionSlug}/`
      const isActiveSec = isActiveService && activeApiSection === sectionSlug
      const idx2 = String(idx + 1).padStart(2, '0')
      return `<li><a href="${href}" class="sidebar-api-section-link${isActiveSec ? ' active' : ''}" data-section-id="${sectionSlug}">
        <span class="sidebar-api-section-index">${idx2}</span>
        <span class="sidebar-api-section-label">${escapeHTML(section.title)}</span>
      </a></li>`
    }).join('')

    return `
    <div class="sidebar-api-group${expanded ? ' open' : ''}${isActiveService ? ' is-active' : ''}" data-service-slug="${slug}">
      <div class="sidebar-api-row${isActiveService ? ' active' : ''}">
        <a href="${apiHref}" class="sidebar-sub-link${isActiveService ? ' active' : ''}">${escapeHTML(s.name)}</a>
        ${sections.length > 0 ? `
        <button type="button" class="sidebar-api-toggle" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${escapeHTML(s.name)}">
          <svg class="chevron" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
            <path d="M3 4.75L6 7.5L9 4.75" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>` : ''}
      </div>
      ${sections.length > 0 ? `
      <div class="sidebar-api-sections-wrap">
        <div class="sidebar-api-sections-inner">
          <ul class="sidebar-api-sections">${sectionItems}</ul>
        </div>
      </div>` : ''}
    </div>`
  }).join('')

  return `
  <nav class="sidebar">
    <div class="sidebar-scroll">
      <div class="sidebar-logo">
        <div class="logo-mark">R</div>
        <span class="logo-text">repomap</span>
      </div>
      ${gsHTML}
      <div class="sidebar-section">
        <div class="sidebar-label">${t(lang, 'sidebarOverview')}</div>
        <a href="${relRoot}" class="sidebar-link ${active === 'overview' ? 'active' : ''}">${t(lang, 'sidebarIntroduction')}</a>
        <a href="${relRoot}integrations/" class="sidebar-link ${active === 'integrations' ? 'active' : ''}">${t(lang, 'sidebarIntegrations')}</a>
      </div>
      <div class="sidebar-section">
        <div class="sidebar-label">${t(lang, 'sidebarServices')}</div>
        ${serviceLinks}
      </div>
      ${hasAnyApiRef ? `
      <div class="sidebar-section">
        <div class="sidebar-label">${t(lang, 'sidebarApiReference')}</div>
        ${apiRefGroups}
      </div>` : ''}
    </div>
    ${getThemeSwitcherWidget(lang)}
  </nav>`
}

function getThemeSwitcherWidget(lang: Lang): string {
  const labelLight = t(lang, 'themeLight')
  const labelDark = t(lang, 'themeDark')
  const labelSystem = t(lang, 'themeSystem')
  // SVG icons: sun · monitor · moon (1.5 stroke, currentColor)
  const sunSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'
  const sysSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>'
  const moonSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
  return `
    <div class="sidebar-footer">
      <div class="theme-switcher" role="group" aria-label="Theme">
        <button type="button" data-theme-set="light" title="${labelLight}" aria-label="${labelLight}">${sunSvg}</button>
        <button type="button" data-theme-set="system" title="${labelSystem}" aria-label="${labelSystem}">${sysSvg}</button>
        <button type="button" data-theme-set="dark" title="${labelDark}" aria-label="${labelDark}">${moonSvg}</button>
      </div>
    </div>`
}

function footerHTML(docs: Documentation, lang: Lang): string {
  const when = new Date(docs.generatedAt).toLocaleString(lang === 'es' ? 'es-ES' : 'en-US')
  return `<footer class="doc-footer">${t(lang, 'footerGenerated')} <strong>repomap</strong> · ${t(lang, 'footerPowered')} <strong>graphify</strong> · ${when}</footer>`
}

// ── Utils ────────────────────────────────────────────────────────────────────

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[@]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeName(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function matchService(repoName: string, serviceName: string): boolean {
  const a = normalizeName(repoName)
  const b = normalizeName(serviceName)
  if (!a || !b) return false
  return a === b || a.endsWith(b) || b.endsWith(a) || a.startsWith(b) || b.startsWith(a)
}

function getServiceIcon(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('auth') || n.includes('user')) return '◐'
  if (n.includes('payment') || n.includes('billing')) return '◇'
  if (n.includes('gateway') || n.includes('api') || n.includes('cli')) return '◉'
  if (n.includes('notification') || n.includes('email')) return '◑'
  if (n.includes('data') || n.includes('db') || n.includes('store')) return '◈'
  if (n.includes('search')) return '◎'
  if (n.includes('worker') || n.includes('queue')) return '◍'
  if (n.includes('adapter')) return '◊'
  if (n.includes('core') || n.includes('engine')) return '●'
  return '○'
}

function escapeHTML(str: string | undefined | null): string {
  if (str == null) return ''
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
