// ─────────────────────────────────────────────────────────────────────────────
// Shared CSS for all generated pages.
// Aesthetic direction: "Editorial Light" — warm paper-white background,
// Fraunces (display serif) + IBM Plex Sans (body) + IBM Plex Mono (code).
// Restrained color: mostly grayscale prose with a single amber accent and
// dark code blocks against the light page (Stripe/Anthropic editorial move).
// ─────────────────────────────────────────────────────────────────────────────

export function getSharedCSS(): string {
  return `<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    /* Warm paper-light palette */
    --bg: #fbf9f3;                 /* warm off-white, paper-like */
    --bg-tint: #f6f3ea;            /* slightly warmer for sidebar tint */
    --surface: #ffffff;            /* card / panel — pops gently from bg */
    --surface-2: #f2eee2;          /* nested / subtle tint */
    --surface-3: #ebe6d7;          /* deeper tint */
    --border: #ebe4d3;             /* warm hairline */
    --border-strong: #d8cfb8;      /* stronger divider */
    --code-bg: #2b2519;            /* warm taupe — softer than near-black, harmonious with cream */
    --code-header-bg: #221d13;     /* slightly deeper for header bar */

    /* Text — warm near-black, high contrast on cream */
    --text: #1f1b15;
    --text-strong: #0a0807;
    --text-muted: #5e574a;
    --text-faint: #8f8675;

    /* Accents — deep warm amber for legibility on light, deep sage secondary */
    --accent: #ad5612;             /* darker amber so it carries weight on cream */
    --accent-soft: rgba(173, 86, 18, 0.08);
    --accent-line: rgba(173, 86, 18, 0.28);
    --accent-2: #2d6a52;
    --accent-2-soft: rgba(45, 106, 82, 0.08);
    --coral: #b13a26;

    /* Method colors — deeper for light bg legibility */
    --m-get: #2d6a52;
    --m-post: #295793;
    --m-put: #8c6310;
    --m-delete: #b13a26;

    /* Layout */
    --sidebar-width: 296px;
    --toc-width: 256px;
    --content-max: 720px;

    /* Typography */
    --font-display: 'Fraunces', 'Iowan Old Style', 'Apple Garamond', Georgia, serif;
    --font-body: 'IBM Plex Sans', system-ui, sans-serif;
    --font-mono: 'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace;
  }

  /* ── Dark theme overrides ──
     Applied when html[data-theme="dark"] is set (by the no-flash init
     script). The light theme above stays the default. */
  :root[data-theme="dark"] {
    --bg: #0e0c0a;
    --bg-tint: #15110c;
    --surface: #181410;
    --surface-2: #221c16;
    --surface-3: #2c241c;
    --border: #322820;
    --border-strong: #4a3c30;
    --code-bg: #08060a;
    --code-header-bg: #14110c;

    --text: #f4ecdd;
    --text-strong: #ffffff;
    --text-muted: #c4b6a0;
    --text-faint: #8a7f70;

    --accent: #e8a04a;
    --accent-soft: rgba(232, 160, 74, 0.14);
    --accent-line: rgba(232, 160, 74, 0.32);
    --accent-2: #88c0a6;
    --accent-2-soft: rgba(136, 192, 166, 0.14);
    --coral: #e08068;

    --m-get: #88c0a6;
    --m-post: #6b9bd1;
    --m-put: #e8c44a;
    --m-delete: #e08068;
  }

  :root[data-theme="dark"] ::selection { background: rgba(232, 160, 74, 0.30); color: #ffffff; }

  /* In dark mode, give the page a touch of atmosphere with very faint
     radial gradients. Light mode stays clean paper. */
  :root[data-theme="dark"] body {
    background-image:
      radial-gradient(ellipse at top, rgba(232, 160, 74, 0.04), transparent 60%),
      radial-gradient(ellipse at bottom right, rgba(136, 192, 166, 0.03), transparent 50%);
  }

  /* Code blocks in dark mode use a deeper near-black for a recessed feel
     (no warm taupe like the light theme). Border/shadow become subtler. */
  :root[data-theme="dark"] .code-block,
  :root[data-theme="dark"] pre,
  :root[data-theme="dark"] .symbol-signature {
    border-color: var(--border);
    box-shadow: none;
  }
  :root[data-theme="dark"] .code-block-header {
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  }
  :root[data-theme="dark"] .code-block-copy {
    border-color: rgba(255, 255, 255, 0.08);
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-body);
    font-size: 16.5px;
    line-height: 1.75;
    font-feature-settings: 'kern' 1, 'liga' 1, 'calt' 1;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    display: flex;
    min-height: 100vh;
  }

  ::selection { background: rgba(173, 86, 18, 0.18); color: var(--text-strong); }

  /* ── Sidebar ──
     Sidebar is a fixed flex column. The .sidebar-scroll area takes the
     middle and scrolls internally; the .sidebar-footer (theme switcher)
     is pinned to the bottom and stays visible regardless of scroll. */
  .sidebar {
    width: var(--sidebar-width);
    height: 100vh;
    background: var(--bg-tint);
    border-right: 1px solid var(--border);
    position: fixed;
    top: 0; left: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    z-index: 100;
  }
  .sidebar-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 28px 0 16px;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }
  .sidebar-scroll::-webkit-scrollbar { width: 8px; }
  .sidebar-scroll::-webkit-scrollbar-track { background: transparent; }
  .sidebar-scroll::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 4px;
    border: 2px solid var(--bg-tint);
  }
  .sidebar-scroll::-webkit-scrollbar-thumb:hover { background: var(--text-faint); }

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
    background: rgba(28, 22, 14, 0.78);
    backdrop-filter: blur(10px);
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
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(20, 16, 11, 0.72);
  }
  .mermaid-modal-help {
    font-family: var(--font-mono);
    font-size: 12px;
    color: #c4b6a0;
    letter-spacing: 0.04em;
  }
  .mermaid-modal-actions { display: flex; gap: 10px; }
  .mermaid-modal-btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.14);
    color: #f0e9d8;
    font-family: var(--font-mono);
    font-size: 12px;
    padding: 7px 14px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 120ms;
  }
  .mermaid-modal-btn:hover {
    color: #ffffff;
    border-color: rgba(232, 160, 74, 0.55);
    background: rgba(232, 160, 74, 0.18);
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
  .service-card .card-meta {
    display: inline-block;
    margin-top: 10px;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.06em;
    color: var(--text-faint);
    text-transform: lowercase;
  }
  .api-section-card .card-icon {
    font-family: var(--font-display);
    color: var(--accent);
  }
  .api-sections-lead {
    color: var(--text-muted);
    font-size: 15px;
    line-height: 1.65;
    margin-bottom: 22px;
    max-width: 64ch;
  }

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
    border: 1px solid rgba(43, 37, 25, 0.10);
    border-radius: 10px;
    background: var(--code-bg);
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(43, 37, 25, 0.04), 0 6px 18px -12px rgba(43, 37, 25, 0.18);
  }
  .code-block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--code-header-bg);
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }
  .code-block-lang {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #8a8070;
  }
  .code-block-copy {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.10);
    color: #c4b6a0;
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
    color: #e8a04a;
    border-color: rgba(232, 160, 74, 0.40);
    background: rgba(232, 160, 74, 0.10);
  }
  .code-block-copy.copied { color: #88c0a6; border-color: rgba(136,192,166,0.5); background: rgba(136,192,166,0.12); }
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
    border: 1px solid rgba(43, 37, 25, 0.10);
    border-radius: 10px;
    padding: 20px 22px;
    overflow-x: auto;
    margin: 20px 0;
    line-height: 1.7;
    box-shadow: 0 1px 2px rgba(43, 37, 25, 0.04), 0 6px 18px -12px rgba(43, 37, 25, 0.18);
  }
  pre, .code-block pre, .code-block code { color: #f0e9d8; }
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
    border: 1px solid var(--border);
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

  /* ── Syntax highlighting — tuned for DARK code blocks on light page ── */
  .hljs { color: #f0e9d8; background: transparent; }
  .hljs-comment, .hljs-quote { color: #8a8070; font-style: italic; }
  .hljs-keyword, .hljs-selector-tag, .hljs-built_in, .hljs-name { color: #e8a04a; }
  .hljs-string, .hljs-symbol, .hljs-bullet, .hljs-regexp { color: #88c0a6; }
  .hljs-number, .hljs-literal, .hljs-variable, .hljs-template-variable { color: #e08068; }
  .hljs-attr, .hljs-attribute { color: #e8c44a; }
  .hljs-tag { color: #c4b6a0; }
  .hljs-tag .hljs-name { color: #88c0a6; }
  .hljs-tag .hljs-attr { color: #e8c44a; }
  .hljs-tag .hljs-string { color: #f0e9d8; }
  .hljs-title, .hljs-section, .hljs-class .hljs-title, .hljs-function .hljs-title { color: #ffffff; font-weight: 500; }
  .hljs-type, .hljs-class { color: #e8a04a; }
  .hljs-meta, .hljs-meta .hljs-keyword { color: #8a8070; }
  .hljs-punctuation { color: #c4b6a0; }
  .hljs-property { color: #f0e9d8; }
  .hljs-params { color: #f0e9d8; }
  .hljs-emphasis { font-style: italic; }
  .hljs-strong { font-weight: 600; }
  .hljs-deletion { color: #e08068; background: rgba(224,128,104,0.10); }
  .hljs-addition { color: #88c0a6; background: rgba(136,192,166,0.10); }

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

  /* ── Sidebar API ref dropdown groups ──
     Editorial pattern: package row + chevron act as a single hit target,
     and the expanded list reads like a numbered index. */
  .sidebar-api-group { margin-bottom: 1px; }
  .sidebar-api-row {
    display: flex;
    align-items: stretch;
    border-radius: 7px;
    position: relative;
    transition: background-color 140ms ease;
  }
  .sidebar-api-row::before {
    content: '';
    position: absolute;
    left: 4px;
    top: 50%;
    width: 2px;
    height: 0;
    background: var(--accent);
    border-radius: 2px;
    transform: translateY(-50%);
    transition: height 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .sidebar-api-row:hover { background: var(--surface-2); }
  .sidebar-api-row.active { background: var(--accent-soft); }
  .sidebar-api-row.active::before { height: 16px; }

  .sidebar-api-row .sidebar-sub-link {
    flex: 1;
    min-width: 0;
    margin-bottom: 0;
    padding: 8px 6px 8px 12px;
    background: transparent;
    border-radius: 7px 0 0 7px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 12.5px;
    letter-spacing: -0.005em;
  }
  .sidebar-api-row .sidebar-sub-link:hover { background: transparent; color: var(--text); }
  .sidebar-api-row .sidebar-sub-link.active {
    background: transparent;
    color: var(--accent);
    font-weight: 500;
  }
  .sidebar-api-toggle {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0 9px;
    color: var(--text-faint);
    border-radius: 0 7px 7px 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 140ms;
    flex-shrink: 0;
  }
  .sidebar-api-row.active .sidebar-api-toggle { color: var(--accent); }
  .sidebar-api-toggle:hover { color: var(--text); }
  .sidebar-api-row.active .sidebar-api-toggle:hover { color: var(--accent); }
  .sidebar-api-toggle:focus-visible {
    outline: 2px solid var(--accent-line);
    outline-offset: -2px;
  }
  .sidebar-api-toggle .chevron {
    transition: transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 140ms;
    transform: rotate(-90deg);
    opacity: 0.85;
  }
  .sidebar-api-group.open .sidebar-api-toggle .chevron {
    transform: rotate(0deg);
    opacity: 1;
  }
  .sidebar-api-toggle:active .chevron { transform: rotate(-90deg) scale(0.88); }
  .sidebar-api-group.open .sidebar-api-toggle:active .chevron { transform: rotate(0deg) scale(0.88); }

  /* Smooth expand using the grid-template-rows 0fr/1fr pattern.
     Three-element structure: wrap (grid) > inner (overflow:hidden) > ul (styled).
     The inner is the bulletproof clip — guarantees no padding/border leakage. */
  .sidebar-api-sections-wrap {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .sidebar-api-group.open .sidebar-api-sections-wrap { grid-template-rows: 1fr; }

  .sidebar-api-sections-inner {
    overflow: hidden;
    min-height: 0;
  }

  .sidebar-api-sections {
    list-style: none;
    margin: 4px 0 6px 16px;
    padding: 2px 0 2px 12px;
    border-left: 1px solid var(--border);
    transition: border-color 220ms ease;
  }
  .sidebar-api-group.is-active .sidebar-api-sections { border-left-color: var(--accent-line); }
  .sidebar-api-sections li { margin: 0; }
  .sidebar-api-section-link {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 6px 10px 6px 8px;
    border-radius: 5px;
    text-decoration: none;
    color: var(--text-faint);
    font-size: 13px;
    font-weight: 400;
    line-height: 1.45;
    transition: background-color 120ms, color 120ms;
  }
  .sidebar-api-section-link:hover { background: var(--surface-2); color: var(--text); }
  .sidebar-api-section-link.active {
    color: var(--accent);
    background: var(--accent-soft);
    font-weight: 500;
  }
  .sidebar-api-section-index {
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-faint);
    min-width: 18px;
    flex-shrink: 0;
    font-feature-settings: 'tnum' 1;
    transition: color 120ms;
  }
  .sidebar-api-section-link:hover .sidebar-api-section-index { color: var(--text-muted); }
  .sidebar-api-section-link.active .sidebar-api-section-index { color: var(--accent); }
  .sidebar-api-section-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* ── Symbol list TOC (API section page) ── */
  .toc-symbol-list { list-style: none; padding: 0; margin: 0; }
  .toc-symbol-list li { margin: 0; }
  .toc-symbol-list a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 0 6px 14px;
    margin-left: -14px;
    border-left: 2px solid transparent;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-faint);
    text-decoration: none;
    transition: color 140ms, border-color 200ms ease;
  }
  .toc-symbol-list a:hover { color: var(--text); }
  .toc-symbol-list a.active {
    color: var(--text-strong);
    border-left-color: var(--accent);
  }
  .toc-symbol-list a.active .toc-sym-name { font-weight: 500; }
  .toc-sym-kind {
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0;
    background: var(--surface-2);
    color: var(--text-faint);
    border: 1px solid transparent;
    border-radius: 4px;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    transition: border-color 160ms ease, transform 160ms ease;
  }
  .toc-symbol-list a:hover .toc-sym-kind { transform: translateY(-0.5px); }
  .toc-symbol-list a.active .toc-sym-kind {
    border-color: currentColor;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.18);
  }
  .toc-sym-kind-class { color: var(--accent); background: rgba(232, 160, 74, 0.12); }
  .toc-sym-kind-function, .toc-sym-kind-method { color: var(--accent-2); background: rgba(136, 192, 166, 0.12); }
  .toc-sym-kind-interface, .toc-sym-kind-type { color: #7aaedf; background: rgba(122, 174, 223, 0.12); }
  .toc-sym-kind-variable, .toc-sym-kind-constant { color: var(--coral); background: rgba(224, 128, 104, 0.12); }
  .toc-sym-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
    flex: 1;
    font-feature-settings: 'tnum' 1;
  }
  .toc-empty {
    color: var(--text-faint);
    font-size: 12.5px;
    font-style: italic;
    padding: 6px 0;
  }

  /* ── Numbered TOC (API ref landing) ── */
  .toc-numbered { list-style: none; padding: 0; margin: 0; counter-reset: none; }
  .toc-numbered li { margin: 0; }
  .toc-numbered a {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 7px 0 7px 14px;
    margin-left: -14px;
    border-left: 2px solid transparent;
    font-size: 13.5px;
    line-height: 1.5;
    color: var(--text-muted);
    text-decoration: none;
    transition: color 140ms, border-color 200ms ease, background 160ms ease;
  }
  .toc-numbered a:hover {
    color: var(--text);
    border-left-color: var(--border-strong);
  }
  .toc-num {
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-faint);
    min-width: 20px;
    flex-shrink: 0;
    font-feature-settings: 'tnum' 1;
    transition: color 140ms;
  }
  .toc-numbered a:hover .toc-num { color: var(--accent); }
  .toc-num-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .toc-num-meta {
    font-family: var(--font-mono);
    font-size: 10.5px;
    color: var(--text-faint);
    font-feature-settings: 'tnum' 1;
    flex-shrink: 0;
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
    color: #88c0a6;
    background: var(--code-bg);
    border: 1px solid rgba(43, 37, 25, 0.10);
    border-radius: 7px;
    padding: 12px 16px;
    margin: 0 0 16px;
    overflow-x: auto;
    line-height: 1.65;
    white-space: pre;
    box-shadow: 0 1px 2px rgba(43, 37, 25, 0.04), 0 6px 16px -12px rgba(43, 37, 25, 0.18);
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

  /* ── Type cross-link (inside params table type column + returns block) ── */
  .type-link {
    color: inherit;
    text-decoration: none;
    border-bottom: 1px dashed rgba(136, 192, 166, 0.42);
    padding-bottom: 1px;
    transition: color 140ms ease, border-bottom-color 140ms ease, background-color 140ms ease;
  }
  .type-link:hover {
    color: var(--accent);
    border-bottom: 1px solid var(--accent);
    background: var(--accent-soft);
    border-radius: 3px;
    padding: 0 3px 1px;
    margin: 0 -3px;
  }
  .symbol-returns .type-link { border-bottom-color: rgba(136, 192, 166, 0.45); }
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

  /* ── Tutorial / Get Started pages ── */
  .tutorial-step {
    position: relative;
    padding-left: 0;
    margin-bottom: 48px;
  }
  /* Inline mono marker integrated with the title: "01 — Instala repomap…".
     Single hairline below. The h2's own section divider is suppressed so
     we don't get a double rule. */
  .tutorial-step-head {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin: 0 0 26px;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--border);
  }
  .tutorial-step-head h2 {
    margin: 0;
    padding-bottom: 0;
    border-bottom: none;
    line-height: 1.18;
  }
  .tutorial-step-head h2::before { display: none; }
  .tutorial-step-marker {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 13px;
    line-height: 1;
    letter-spacing: 0.08em;
    color: var(--accent);
    font-feature-settings: 'tnum' 1;
    flex-shrink: 0;
    background: none;
    border: none;
    padding: 0;
    border-radius: 0;
    text-transform: none;
    align-self: baseline;
    position: relative;
    top: -0.18em;
  }
  .tutorial-step-marker::after {
    content: ' \\2014';
    color: var(--text-faint);
    margin-left: 8px;
    font-family: var(--font-body);
    font-weight: 400;
  }
  .tutorial-step p {
    color: var(--text);
    font-size: 16px;
    line-height: 1.75;
    margin-bottom: 14px;
    max-width: 66ch;
  }
  .tutorial-step p:last-child { margin-bottom: 0; }

  .tutorial-code-wrap { margin: 18px 0 8px; }
  .tutorial-code-caption {
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--text-faint);
    letter-spacing: 0.04em;
    margin-bottom: 8px;
    text-transform: uppercase;
  }

  .tutorial-note {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 18px 0;
    padding: 14px 18px;
    border-radius: 8px;
    border-left: 3px solid var(--accent);
    background: var(--surface);
  }
  .tutorial-note-label {
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent);
  }
  .tutorial-note p {
    margin: 0;
    color: var(--text);
    font-size: 14.5px;
    line-height: 1.65;
  }
  .tutorial-note-tip { border-left-color: var(--accent-2); }
  .tutorial-note-tip .tutorial-note-label { color: var(--accent-2); }
  .tutorial-note-warning { border-left-color: var(--coral); background: rgba(177, 58, 38, 0.06); }
  .tutorial-note-warning .tutorial-note-label { color: var(--coral); }
  .tutorial-note-info { border-left-color: var(--border-strong); background: var(--surface-2); }
  .tutorial-note-info .tutorial-note-label { color: var(--text-muted); }

  /* ── Troubleshooting page ── */
  .troubleshoot-item {
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    padding: 22px 26px;
    margin-bottom: 18px;
  }
  .troubleshoot-item:target {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .troubleshoot-head {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 18px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  .troubleshoot-head h2 {
    margin: 0;
    padding-bottom: 0;
    border-bottom: none;
  }
  .troubleshoot-head h2::before { display: none; }
  .troubleshoot-label {
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--coral);
  }
  .troubleshoot-problem {
    font-family: var(--font-mono);
    font-size: 15.5px;
    font-weight: 500;
    color: var(--text-strong);
    line-height: 1.5;
    margin: 0;
    letter-spacing: -0.01em;
  }
  .troubleshoot-cause { margin-bottom: 16px; }
  .troubleshoot-sub-label {
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--text-faint);
    margin-bottom: 8px;
  }
  .troubleshoot-cause p,
  .troubleshoot-solution p {
    color: var(--text);
    font-size: 15px;
    line-height: 1.7;
    margin-bottom: 10px;
    max-width: 66ch;
  }
  .troubleshoot-solution p:last-child { margin-bottom: 0; }

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

  /* ── Theme switcher (segmented control, pinned at sidebar bottom) ── */
  .sidebar-footer {
    flex-shrink: 0;
    padding: 14px 20px 16px;
    border-top: 1px solid var(--border);
    background: var(--bg-tint);
  }
  .theme-switcher {
    display: inline-flex;
    align-items: center;
    gap: 0;
    padding: 3px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
  }
  .theme-switcher button {
    appearance: none;
    background: transparent;
    border: none;
    cursor: pointer;
    width: 30px;
    height: 28px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-faint);
    transition: color 140ms ease, background-color 160ms ease;
  }
  .theme-switcher button svg { width: 14px; height: 14px; }
  .theme-switcher button:hover { color: var(--text); }
  .theme-switcher button[aria-pressed="true"] {
    background: var(--surface);
    color: var(--accent);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
  }
  :root[data-theme="dark"] .theme-switcher button[aria-pressed="true"] {
    background: var(--surface-3);
    box-shadow: none;
  }
  .theme-switcher button:focus-visible {
    outline: 2px solid var(--accent-line);
    outline-offset: 2px;
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
