// ─────────────────────────────────────────────────────────────────────────────
// Shared CSS for all generated pages.
// Aesthetic direction: "Editorial Technical Warmth" — warm dark palette,
// Fraunces (display serif) + IBM Plex Sans (body) + IBM Plex Mono (code).
// High contrast for reading comfort, no purple gradients, no italic body.
// ─────────────────────────────────────────────────────────────────────────────

export function getSharedCSS(): string {
  return `<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    /* Warm dark palette */
    --bg: #0e0c0a;
    --bg-tint: #15110c;
    --surface: #181410;
    --surface-2: #221c16;
    --surface-3: #2c241c;
    --border: #322820;
    --border-strong: #4a3c30;
    --code-bg: #06050a;            /* near-absolute black for code blocks */
    --code-header-bg: #1e1812;     /* warmer dark for code header */

    /* Text — warmer cream, higher contrast */
    --text: #f6efe2;
    --text-strong: #ffffff;
    --text-muted: #c4b6a0;
    --text-faint: #8a7f70;

    /* Accents — warm amber primary + sage secondary, no AI purple */
    --accent: #e8a04a;
    --accent-soft: rgba(232, 160, 74, 0.14);
    --accent-line: rgba(232, 160, 74, 0.32);
    --accent-2: #88c0a6;
    --accent-2-soft: rgba(136, 192, 166, 0.14);
    --coral: #e08068;

    /* Method colors — muted, warm */
    --m-get: #88c0a6;
    --m-post: #6b9bd1;
    --m-put: #e8c44a;
    --m-delete: #e08068;

    /* Layout */
    --sidebar-width: 268px;
    --toc-width: 256px;
    --content-max: 740px;

    /* Typography */
    --font-display: 'Fraunces', 'Iowan Old Style', 'Apple Garamond', Georgia, serif;
    --font-body: 'IBM Plex Sans', system-ui, sans-serif;
    --font-mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    background-image:
      radial-gradient(ellipse at top, rgba(232, 160, 74, 0.04), transparent 60%),
      radial-gradient(ellipse at bottom right, rgba(136, 192, 166, 0.03), transparent 50%);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 16px;
    line-height: 1.75;
    font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    display: flex;
    min-height: 100vh;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: var(--sidebar-width);
    min-height: 100vh;
    background: var(--bg-tint);
    border-right: 1px solid var(--border);
    padding: 28px 0;
    position: fixed;
    top: 0; left: 0;
    overflow-y: auto;
    z-index: 100;
  }

  .sidebar-logo {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 0 24px 28px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
  }
  .logo-mark {
    width: 34px; height: 34px;
    background: var(--accent);
    border-radius: 9px;
    display: flex; align-items: center; justify-content: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 14px;
    color: #1a1106;
    font-variation-settings: 'opsz' 14;
    letter-spacing: -0.02em;
  }
  .logo-text {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 19px;
    color: var(--text-strong);
    letter-spacing: -0.02em;
    font-variation-settings: 'opsz' 24, 'SOFT' 50;
  }

  .sidebar-section { margin-bottom: 4px; padding: 0 14px; }
  .sidebar-label {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--text-faint);
    padding: 14px 10px 8px;
  }
  .sidebar-link {
    display: block;
    padding: 8px 12px;
    border-radius: 7px;
    text-decoration: none;
    color: var(--text-muted);
    font-size: 14.5px;
    font-weight: 450;
    transition: background-color 120ms, color 120ms;
  }
  .sidebar-link:hover { background: var(--surface-2); color: var(--text); }
  .sidebar-link.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 500;
  }

  /* ── Main content ── */
  .main-content {
    margin-left: var(--sidebar-width);
    flex: 1;
    padding: 72px 56px 96px 72px;
    min-width: 0;
  }
  .content-inner {
    max-width: var(--content-max);
    margin: 0 auto;
  }
  @media (min-width: 1280px) {
    .main-content { padding-right: calc(var(--toc-width) + 56px); }
    .content-inner { margin: 0; }
  }

  /* ── Right TOC ── */
  .toc {
    display: none;
    position: fixed;
    top: 0;
    right: 0;
    width: var(--toc-width);
    height: 100vh;
    padding: 84px 32px 48px;
    overflow-y: auto;
    border-left: 1px solid var(--border);
    background: var(--bg);
  }
  @media (min-width: 1280px) { .toc { display: block; } }

  .toc-label {
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }
  .toc ul { list-style: none; padding: 0; }
  .toc li { margin: 0; }
  .toc a {
    display: block;
    padding: 6px 0;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--text-faint);
    text-decoration: none;
    border-left: 2px solid transparent;
    padding-left: 14px;
    margin-left: -14px;
    transition: color 120ms, border-color 120ms;
  }
  .toc a:hover { color: var(--text); }
  .toc a.active { color: var(--accent); border-left-color: var(--accent); }
  .toc .toc-sub { padding-left: 14px; }
  .toc .toc-sub a { font-size: 12.5px; padding: 4px 0 4px 14px; color: var(--text-faint); }

  /* ── Hero ── */
  .hero { margin-bottom: 72px; }
  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--accent-soft);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 5px 11px;
    border-radius: 999px;
    margin-bottom: 24px;
    border: 1px solid var(--accent-line);
  }
  .hero-badge::before {
    content: '';
    width: 5px; height: 5px;
    background: var(--accent);
    border-radius: 50%;
  }
  .hero h1 {
    font-family: var(--font-display);
    font-weight: 500;
    font-variation-settings: 'opsz' 144, 'SOFT' 50;
    font-size: clamp(40px, 5.5vw, 64px);
    line-height: 1.04;
    letter-spacing: -0.025em;
    color: var(--text-strong);
    margin-bottom: 24px;
    max-width: 16ch;
  }
  .hero-summary {
    font-size: 19px;
    line-height: 1.65;
    color: var(--text-muted);
    max-width: 56ch;
  }

  /* ── Page header (per-service) ── */
  .page-header { margin-bottom: 56px; }
  .breadcrumb {
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--text-faint);
    margin-bottom: 16px;
    letter-spacing: 0.02em;
  }
  .breadcrumb a { color: var(--accent); text-decoration: none; }
  .breadcrumb a:hover { text-decoration: underline; text-underline-offset: 3px; }
  .page-header h1 {
    font-family: var(--font-display);
    font-weight: 500;
    font-variation-settings: 'opsz' 96;
    font-size: clamp(34px, 4.2vw, 46px);
    letter-spacing: -0.02em;
    line-height: 1.1;
    color: var(--text-strong);
    margin-bottom: 14px;
  }
  .page-subtitle {
    font-size: 18px;
    color: var(--text-muted);
    max-width: 60ch;
    line-height: 1.6;
  }

  /* ── Sections ── */
  .section { margin-bottom: 68px; }
  .section h2 {
    font-family: var(--font-display);
    font-weight: 500;
    font-variation-settings: 'opsz' 36;
    font-size: 26px;
    letter-spacing: -0.015em;
    color: var(--text-strong);
    margin-bottom: 24px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .section h2::before {
    content: '';
    width: 6px; height: 6px;
    background: var(--accent);
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* ── Analogy box — comfortable to read ── */
  .analogy-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent);
    border-radius: 6px;
    padding: 26px 30px;
    margin: 28px 0 44px;
  }
  .analogy-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.14em;
    color: var(--accent);
    margin-bottom: 14px;
    text-transform: uppercase;
  }
  .analogy-label::before { content: '✦'; font-size: 13px; }
  .analogy-box p {
    color: var(--text);
    font-size: 17.5px;
    line-height: 1.78;
    font-style: normal;
    max-width: 64ch;
  }

  /* ── Mermaid wrapper (with expand button) ── */
  .mermaid-wrapper {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 36px;
    overflow-x: auto;
  }
  .mermaid-wrapper .mermaid { display: flex; justify-content: center; }
  .mermaid-expand-btn {
    position: absolute;
    top: 12px;
    right: 12px;
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 120ms;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    z-index: 2;
  }
  .mermaid-expand-btn:hover {
    color: var(--accent);
    border-color: var(--accent-line);
    background: var(--accent-soft);
  }
  .mermaid-expand-btn svg { width: 12px; height: 12px; }

  /* ── Mermaid modal viewer ── */
  .mermaid-modal {
    position: fixed;
    inset: 0;
    background: rgba(10, 8, 5, 0.92);
    backdrop-filter: blur(8px);
    z-index: 1000;
    display: none;
    flex-direction: column;
  }
  .mermaid-modal.open { display: flex; }
  .mermaid-modal-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-tint);
  }
  .mermaid-modal-help {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-faint);
    letter-spacing: 0.04em;
  }
  .mermaid-modal-actions { display: flex; gap: 10px; }
  .mermaid-modal-btn {
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 7px 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 120ms;
  }
  .mermaid-modal-btn:hover {
    color: var(--accent);
    border-color: var(--accent-line);
    background: var(--accent-soft);
  }
  .mermaid-modal-canvas {
    flex: 1;
    overflow: hidden;
    cursor: grab;
    position: relative;
  }
  .mermaid-modal-canvas.dragging { cursor: grabbing; }
  .mermaid-modal-canvas svg {
    transform-origin: 0 0;
    user-select: none;
  }

  /* ── Service grid ── */
  .service-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }
  .service-card {
    display: flex;
    align-items: flex-start;
    gap: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 22px 24px;
    text-decoration: none;
    color: inherit;
    transition: all 160ms ease;
    position: relative;
  }
  .service-card::after {
    content: '→';
    position: absolute;
    top: 22px; right: 22px;
    color: var(--text-faint);
    font-family: var(--font-mono);
    transition: transform 160ms, color 160ms;
  }
  .service-card:hover {
    border-color: var(--accent-line);
    background: var(--surface-2);
    transform: translateY(-1px);
  }
  .service-card:hover::after { color: var(--accent); transform: translateX(3px); }
  .service-card .card-icon {
    font-size: 22px;
    flex-shrink: 0;
    line-height: 1;
    margin-top: 2px;
  }
  .service-card .card-content { padding-right: 24px; }
  .service-card h3 {
    font-family: var(--font-display);
    font-weight: 500;
    font-variation-settings: 'opsz' 24;
    font-size: 18px;
    letter-spacing: -0.01em;
    color: var(--text-strong);
    margin-bottom: 6px;
    line-height: 1.3;
  }
  .service-card p { font-size: 14px; color: var(--text-muted); line-height: 1.55; }

  /* ── Endpoints ── */
  .endpoint {
    border: 1px solid var(--border);
    border-radius: 9px;
    padding: 20px 22px;
    margin-bottom: 12px;
    background: var(--surface);
  }
  .endpoint-header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
  }
  .method {
    font-family: var(--font-mono);
    font-size: 11.5px;
    font-weight: 500;
    padding: 4px 9px;
    border-radius: 5px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .method-get { background: rgba(136, 192, 166, 0.14); color: var(--m-get); }
  .method-post { background: rgba(107, 155, 209, 0.14); color: var(--m-post); }
  .method-put, .method-patch { background: rgba(232, 196, 74, 0.14); color: var(--m-put); }
  .method-delete { background: rgba(224, 128, 104, 0.14); color: var(--m-delete); }
  .endpoint-path {
    font-family: var(--font-mono);
    font-size: 14.5px;
    color: var(--text);
  }
  .endpoint p { color: var(--text-muted); font-size: 14.5px; }

  /* ── Code blocks ── */
  .code-block {
    position: relative;
    margin: 20px 0;
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    background: var(--code-bg);
    overflow: hidden;
    box-shadow: 0 1px 0 rgba(232, 160, 74, 0.04) inset, 0 12px 32px -16px rgba(0, 0, 0, 0.5);
  }
  .code-block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--code-header-bg);
    border-bottom: 1px solid var(--border);
  }
  .code-block-lang {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
  }
  .code-block-copy {
    background: transparent;
    border: 1px solid var(--border-strong);
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 120ms;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .code-block-copy svg { width: 12px; height: 12px; }
  .code-block-copy:hover {
    color: var(--accent);
    border-color: var(--accent-line);
    background: var(--accent-soft);
  }
  .code-block-copy.copied { color: var(--accent-2); border-color: rgba(136,192,166,0.5); background: var(--accent-2-soft); }
  .code-block pre {
    margin: 0;
    padding: 18px 20px;
    overflow-x: auto;
    background: transparent;
    border: none;
    border-radius: 0;
    line-height: 1.7;
  }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border-strong);
    border-radius: 10px;
    padding: 20px 22px;
    overflow-x: auto;
    margin: 20px 0;
    line-height: 1.7;
  }
  code {
    font-family: var(--font-mono);
    font-size: 13.5px;
    color: var(--text);
  }
  :not(pre) > code {
    background: var(--surface-2);
    padding: 1.5px 6px;
    border-radius: 4px;
    font-size: 13px;
    color: var(--accent);
  }

  /* ── File tree ── */
  .tree-block {
    line-height: 1.55;
    font-size: 13px;
  }
  .tree-block code { color: var(--text); }
  .tree-line { display: block; white-space: pre; }
  .tree-prefix { color: var(--text-faint); }
  .tree-dir { color: var(--accent); font-weight: 500; }
  .tree-file { color: var(--text-muted); }
  .tree-truncated { color: var(--text-faint); font-style: italic; }

  /* ── Syntax highlighting (highlight.js classes, themed to our palette) ── */
  .hljs { color: var(--text); background: transparent; }
  .hljs-comment, .hljs-quote { color: var(--text-faint); font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-name {
    color: var(--accent);
  }
  .hljs-string, .hljs-symbol, .hljs-bullet, .hljs-regexp {
    color: var(--accent-2);
  }
  .hljs-number, .hljs-literal, .hljs-variable, .hljs-template-variable {
    color: var(--coral);
  }
  .hljs-attr, .hljs-attribute { color: #e8c44a; }
  .hljs-tag { color: var(--text-muted); }
  .hljs-tag .hljs-name { color: var(--accent-2); }
  .hljs-tag .hljs-attr { color: #e8c44a; }
  .hljs-tag .hljs-string { color: var(--text); }
  .hljs-title, .hljs-section, .hljs-class .hljs-title, .hljs-function .hljs-title {
    color: var(--text-strong); font-weight: 500;
  }
  .hljs-type, .hljs-class { color: var(--accent); }
  .hljs-meta, .hljs-meta .hljs-keyword { color: var(--text-faint); }
  .hljs-punctuation { color: var(--text-muted); }
  .hljs-property { color: var(--text); }
  .hljs-params { color: var(--text); }
  .hljs-emphasis { font-style: italic; }
  .hljs-strong { font-weight: 600; }
  .hljs-deletion { color: var(--coral); background: rgba(224,128,104,0.08); }
  .hljs-addition { color: var(--accent-2); background: rgba(136,192,166,0.08); }

  /* ── Tables ── */
  .env-table { width: 100%; border-collapse: collapse; }
  .env-table th {
    text-align: left;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--text-faint);
    padding: 11px 14px;
    border-bottom: 1px solid var(--border);
  }
  .env-table td {
    padding: 14px 14px;
    border-bottom: 1px solid var(--border);
    font-size: 14.5px;
    color: var(--text);
    vertical-align: top;
  }
  .env-table tr:hover td { background: var(--surface); }
  .badge {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: 10.5px;
    padding: 2.5px 8px;
    border-radius: 4px;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .badge.required { background: rgba(224, 128, 104, 0.16); color: var(--coral); }
  .badge.optional { background: rgba(136, 192, 166, 0.14); color: var(--accent-2); }
  .badge.evidence { background: var(--surface-2); color: var(--text-muted); border: 1px solid var(--border); }

  /* ── Concepts list ── */
  .concepts-list { padding-left: 22px; }
  .concepts-list li {
    margin-bottom: 10px;
    color: var(--text-muted);
    font-size: 15.5px;
    line-height: 1.65;
  }
  .concepts-list li::marker { color: var(--accent); }

  /* ── Prose ── */
  .prose p {
    margin-bottom: 18px;
    color: var(--text);
    font-size: 16.5px;
    line-height: 1.78;
    max-width: 64ch;
  }

  /* ── Flow blocks ── */
  .flow-block {
    margin-bottom: 48px;
    padding: 28px 30px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
  }
  .flow-block h3 {
    font-family: var(--font-display);
    font-weight: 500;
    font-variation-settings: 'opsz' 24;
    font-size: 20px;
    letter-spacing: -0.01em;
    color: var(--text-strong);
    margin-bottom: 10px;
  }
  .flow-steps { padding-left: 22px; margin: 18px 0; }
  .flow-steps li {
    margin-bottom: 8px;
    font-size: 15px;
    color: var(--text);
    line-height: 1.65;
  }
  .flow-steps li::marker { color: var(--accent); font-family: var(--font-mono); font-size: 13px; }

  .example-block { margin-bottom: 36px; }
  .example-block h3 {
    font-family: var(--font-display);
    font-weight: 500;
    font-size: 17px;
    margin-bottom: 8px;
    color: var(--text-strong);
  }

  /* ── Graph link / CTA ── */
  .graph-link {
    color: var(--accent);
    text-decoration: none;
    font-family: var(--font-mono);
    font-size: 13px;
    font-weight: 500;
    padding: 10px 16px;
    border: 1px solid var(--accent-line);
    border-radius: 7px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    background: var(--accent-soft);
    transition: all 140ms;
  }
  .graph-link:hover { background: var(--accent); color: #1a1106; }

  /* ── Footer ── */
  .doc-footer {
    margin-top: 100px;
    padding-top: 28px;
    border-top: 1px solid var(--border);
    font-family: var(--font-mono);
    font-size: 12.5px;
    color: var(--text-faint);
    letter-spacing: 0.02em;
  }
  .doc-footer strong { color: var(--text-muted); font-weight: 500; }

  /* ── Sidebar sub-links (API ref items) ── */
  .sidebar-sub-link {
    display: block;
    padding: 7px 12px;
    border-radius: 6px;
    text-decoration: none;
    color: var(--text-faint);
    font-size: 13.5px;
    font-weight: 400;
    transition: background-color 120ms, color 120ms;
    margin-bottom: 0;
  }
  .sidebar-sub-link:hover { background: var(--surface-2); color: var(--text); }
  .sidebar-sub-link.active {
    color: var(--accent);
    background: var(--accent-soft);
    font-weight: 500;
  }

  /* ── Symbol cards (API reference) ── */
  .symbol-section { margin-bottom: 56px; }
  .symbol-section-intro {
    color: var(--text-muted);
    font-size: 15.5px;
    line-height: 1.7;
    margin-bottom: 28px;
    max-width: 64ch;
  }

  .symbol-card {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    margin-bottom: 16px;
    overflow: hidden;
  }
  .symbol-card:target {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .symbol-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 22px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    flex-wrap: wrap;
  }
  .symbol-kind {
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 500;
    padding: 3px 9px;
    border-radius: 4px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    flex-shrink: 0;
  }
  .symbol-kind-function { background: rgba(136, 192, 166, 0.14); color: var(--accent-2); }
  .symbol-kind-class { background: rgba(232, 160, 74, 0.14); color: var(--accent); }
  .symbol-kind-interface, .symbol-kind-type { background: rgba(107, 155, 209, 0.14); color: #6b9bd1; }
  .symbol-kind-variable, .symbol-kind-constant { background: rgba(224, 128, 104, 0.14); color: var(--coral); }
  .symbol-kind-method { background: rgba(136, 192, 166, 0.10); color: var(--accent-2); }

  .symbol-name {
    font-family: var(--font-mono);
    font-size: 15.5px;
    font-weight: 500;
    color: var(--text-strong);
    letter-spacing: -0.01em;
  }
  .symbol-file {
    margin-left: auto;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--text-faint);
    letter-spacing: 0.01em;
  }

  .symbol-body { padding: 20px 22px; }

  .symbol-signature {
    font-family: var(--font-mono);
    font-size: 13px;
    color: var(--accent-2);
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 7px;
    padding: 12px 16px;
    margin: 0 0 16px;
    overflow-x: auto;
    line-height: 1.65;
    white-space: pre;
  }

  .symbol-description {
    color: var(--text);
    font-size: 15px;
    line-height: 1.75;
    margin-bottom: 20px;
    max-width: 68ch;
  }

  .symbol-section-label {
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-bottom: 10px;
    margin-top: 20px;
  }

  .params-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
    font-size: 13.5px;
  }
  .params-table th {
    text-align: left;
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-faint);
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
  }
  .params-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
    vertical-align: top;
    line-height: 1.6;
  }
  .params-table tr:last-child td { border-bottom: none; }
  .params-table code { font-size: 12.5px; color: var(--accent-2); }
  .param-req { color: var(--coral); font-size: 11px; font-family: var(--font-mono); }
  .param-opt { color: var(--text-faint); font-size: 11px; font-family: var(--font-mono); }

  .symbol-returns {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-left: 3px solid var(--accent-2);
    border-radius: 6px;
    padding: 12px 16px;
    font-size: 14px;
    color: var(--text);
    line-height: 1.65;
    margin-bottom: 16px;
  }
  .symbol-returns strong { color: var(--accent-2); font-family: var(--font-mono); font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; display: block; margin-bottom: 4px; }

  .symbol-example { margin-top: 16px; }

  /* API ref page intro box */
  .api-ref-intro {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px 24px;
    color: var(--text-muted);
    font-size: 15.5px;
    line-height: 1.7;
    margin-bottom: 40px;
    max-width: 64ch;
  }

  @media (max-width: 768px) {
    .sidebar { transform: translateX(-100%); }
    .main-content { margin-left: 0; padding: 36px 24px; }
    .service-grid { grid-template-columns: 1fr; }
    .toc { display: none; }
  }
</style>`
}

export function getFontImports(): string {
  return `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..700,0..100&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;450;500;600&display=swap" rel="stylesheet">`
}
