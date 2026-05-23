import fs from 'fs'
import path from 'path'
import type { ApiReferenceSection, CodeGraph, Documentation, ServiceDoc, SymbolDoc } from '../types.js'
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
  fs.writeFileSync(path.join(outputPath, 'index.html'), buildIndexHTML(docs, lang))

  for (const service of docs.services) {
    const serviceDir = path.join(outputPath, slugify(service.name))
    fs.mkdirSync(serviceDir, { recursive: true })
    fs.writeFileSync(path.join(serviceDir, 'index.html'), buildServiceHTML(service, docs, graph, lang))

    if (service.apiReference) {
      const apiDir = path.join(serviceDir, 'api')
      fs.mkdirSync(apiDir, { recursive: true })
      fs.writeFileSync(path.join(apiDir, 'index.html'), buildApiRefHTML(service, docs, lang))
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

export function generateMarkdown(docs: Documentation, outputPath: string): void {
  let md = `# ${docs.overview.title}\n\n${docs.overview.summary}\n\n`
  if (docs.overview.analogy) md += `> ${docs.overview.analogy}\n\n`
  for (const service of docs.services) {
    md += `## ${service.name}\n\n${service.purpose}\n\n${service.longDescription}\n\n`
  }
  fs.writeFileSync(path.join(outputPath, 'README.md'), md)
}

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
  const tocItems: TocItem[] = []
  if (ref.sections) {
    for (const section of ref.sections) {
      const id = slugify(section.title)
      tocItems.push({ id, label: section.title, level: 2 })
    }
  }

  const sectionsHTML = (ref.sections ?? []).map((section) => {
    const id = slugify(section.title)
    return `
    <section class="section symbol-section" id="${id}">
      <h2>${escapeHTML(section.title)}</h2>
      ${section.description ? `<p class="symbol-section-intro">${escapeHTML(section.description)}</p>` : ''}
      ${(section.symbols ?? []).length === 0
        ? `<p class="symbol-section-intro">${t(lang, 'apiRefNoSymbols')}</p>`
        : section.symbols.map((sym) => renderSymbolCard(sym, lang)).join('')}
    </section>`
  }).join('')

  return shell({
    lang,
    title: `${service.name} — ${t(lang, 'apiReferenceTitle')} — ${docs.overview.title}`,
    sidebar: buildSidebar(docs, `api:${service.name}`, lang, '../../'),
    tocItems,
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

    ${sectionsHTML || `<p class="symbol-section-intro">${t(lang, 'apiRefNoSymbols')}</p>`}

    ${footerHTML(docs, lang)}`,
  })
}

function renderSymbolCard(sym: SymbolDoc, lang: Lang): string {
  const kindClass = `symbol-kind-${sym.kind}`
  const anchorId = `sym-${slugify(sym.name)}`

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
          <td><code>${escapeHTML(p.type ?? '—')}</code></td>
          <td><span class="${p.required ? 'param-req' : 'param-opt'}">${p.required ? '✓' : '—'}</span></td>
          <td>${escapeHTML(p.description)}</td>
          ${sym.params!.some((q) => q.default != null) ? `<td><code>${escapeHTML(p.default ?? '—')}</code></td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>` : ''

  const returnsHTML = sym.returns ? `
    <div class="symbol-returns">
      <strong>${t(lang, 'apiRefReturns')}</strong>
      ${escapeHTML(sym.returns)}
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
}

export interface TocItem {
  id: string
  label: string
  level: 2 | 3
}

function shell({ lang, title, sidebar, body, tocItems = [] }: ShellOpts): string {
  const toc = tocItems.length > 0 ? `
  <aside class="toc">
    <div class="toc-label">${t(lang, 'onThisPage')}</div>
    <ul>
      ${tocItems.map((item) => item.level === 2
        ? `<li><a href="#${item.id}" data-toc-id="${item.id}">${escapeHTML(item.label)}</a></li>`
        : `<li class="toc-sub"><a href="#${item.id}" data-toc-id="${item.id}">${escapeHTML(item.label)}</a></li>`
      ).join('')}
    </ul>
  </aside>` : ''

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHTML(title)}</title>
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
  ${getCodeBlockEnhancer(lang)}
</body>
</html>`
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
  // active can be: 'overview' | 'integrations' | service-name | 'api:service-name'
  const activeApiService = active.startsWith('api:') ? active.slice(4) : null

  const serviceLinks = docs.services
    .map((s) => {
      const isActive = s.name === active
      return `<a href="${relRoot}${slugify(s.name)}/" class="sidebar-link ${isActive ? 'active' : ''}">${escapeHTML(s.name)}</a>`
    })
    .join('')

  const hasAnyApiRef = docs.services.some((s) => s.apiReference)
  const apiRefLinks = hasAnyApiRef
    ? docs.services
        .filter((s) => s.apiReference)
        .map((s) => {
          const isActive = activeApiService === s.name
          return `<a href="${relRoot}${slugify(s.name)}/api/" class="sidebar-sub-link ${isActive ? 'active' : ''}">${escapeHTML(s.name)}</a>`
        })
        .join('')
    : ''

  return `
  <nav class="sidebar">
    <div class="sidebar-logo">
      <div class="logo-mark">R</div>
      <span class="logo-text">repomap</span>
    </div>
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
      ${apiRefLinks}
    </div>` : ''}
  </nav>`
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
