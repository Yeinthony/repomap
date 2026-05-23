import type { Lang } from './i18n.js'
import { t } from './i18n.js'

// ─────────────────────────────────────────────────────────────────────────────
// Mermaid viewer
//   - mermaid.initialize with our themed colors
//   - after render: wrap each .mermaid in a button → opens fullscreen modal
//     with pan (drag) + zoom (wheel) + reset + Esc-to-close
// No external libraries: ~70 LoC of vanilla JS.
// ─────────────────────────────────────────────────────────────────────────────

export function getMermaidInit(lang: Lang | undefined = 'en'): string {
  const help = t(lang, 'mermaidHelp')
  const closeLabel = t(lang, 'mermaidClose')
  const resetLabel = t(lang, 'mermaidReset')
  const expandLabel = t(lang, 'mermaidExpand')

  return `<div class="mermaid-modal" id="mermaidModal" role="dialog" aria-modal="true" aria-hidden="true">
  <div class="mermaid-modal-header">
    <span class="mermaid-modal-help">${help}</span>
    <div class="mermaid-modal-actions">
      <button class="mermaid-modal-btn" id="mermaidReset">${resetLabel}</button>
      <button class="mermaid-modal-btn" id="mermaidClose">${closeLabel} ✕</button>
    </div>
  </div>
  <div class="mermaid-modal-canvas" id="mermaidCanvas"></div>
</div>

<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
(function() {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
    themeVariables: {
      background: '#181410',
      primaryColor: '#221c16',
      primaryTextColor: '#f6efe2',
      primaryBorderColor: '#322820',
      lineColor: '#c4b6a0',
      secondaryColor: '#2c241c',
      tertiaryColor: '#15110c',
      mainBkg: '#221c16',
      nodeBorder: '#4a3c30',
      clusterBkg: '#15110c',
      clusterBorder: '#322820',
      edgeLabelBackground: '#181410',
      titleColor: '#e8a04a',
      noteBkgColor: '#221c16',
      noteBorderColor: '#e8a04a',
      noteTextColor: '#f6efe2',
      actorBkg: '#221c16',
      actorBorder: '#e8a04a',
      actorTextColor: '#f6efe2',
      actorLineColor: '#c4b6a0',
      signalColor: '#c4b6a0',
      signalTextColor: '#f6efe2',
      labelBoxBkgColor: '#221c16',
      labelBoxBorderColor: '#e8a04a',
      labelTextColor: '#f6efe2',
      loopTextColor: '#f6efe2',
      activationBorderColor: '#e8a04a',
      activationBkgColor: '#2c241c'
    },
    flowchart: { curve: 'basis', padding: 18 },
    sequence: { actorMargin: 60, boxMargin: 12 },
  })

  // Render all diagrams, then add expand buttons.
  mermaid.run().then(() => {
    document.querySelectorAll('.mermaid-wrapper').forEach((wrapper) => {
      if (wrapper.querySelector('.mermaid-expand-btn')) return
      const btn = document.createElement('button')
      btn.className = 'mermaid-expand-btn'
      btn.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg> ${expandLabel}'
      btn.setAttribute('aria-label', '${expandLabel}')
      btn.addEventListener('click', () => openModal(wrapper))
      wrapper.appendChild(btn)
    })
  })

  // ── Modal with pan + zoom ──
  const modal = document.getElementById('mermaidModal')
  const canvas = document.getElementById('mermaidCanvas')
  const resetBtn = document.getElementById('mermaidReset')
  const closeBtn = document.getElementById('mermaidClose')
  let scale = 1, tx = 0, ty = 0
  let isDragging = false, startX = 0, startY = 0, startTx = 0, startTy = 0
  let currentSvg = null

  function applyTransform() {
    if (currentSvg) {
      currentSvg.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')'
    }
  }
  function resetView() {
    if (!currentSvg) return
    const svgRect = currentSvg.getBoundingClientRect()
    const canvRect = canvas.getBoundingClientRect()
    const naturalW = currentSvg.dataset.naturalW ? parseFloat(currentSvg.dataset.naturalW) : svgRect.width / scale
    const naturalH = currentSvg.dataset.naturalH ? parseFloat(currentSvg.dataset.naturalH) : svgRect.height / scale
    const fitScale = Math.min(canvRect.width / naturalW, canvRect.height / naturalH) * 0.9
    scale = Math.max(0.1, Math.min(2, fitScale))
    tx = (canvRect.width - naturalW * scale) / 2
    ty = (canvRect.height - naturalH * scale) / 2
    applyTransform()
  }

  function openModal(wrapper) {
    const srcSvg = wrapper.querySelector('svg')
    if (!srcSvg) return
    canvas.innerHTML = ''
    const clone = srcSvg.cloneNode(true)
    // Capture natural dimensions before mutating
    const bb = srcSvg.getBoundingClientRect()
    clone.dataset.naturalW = bb.width
    clone.dataset.naturalH = bb.height
    clone.removeAttribute('style')
    clone.style.maxWidth = 'none'
    clone.style.maxHeight = 'none'
    canvas.appendChild(clone)
    currentSvg = clone
    modal.classList.add('open')
    modal.setAttribute('aria-hidden', 'false')
    document.body.style.overflow = 'hidden'
    // Reset after the SVG is in the DOM with proper layout
    requestAnimationFrame(resetView)
  }
  function closeModal() {
    modal.classList.remove('open')
    modal.setAttribute('aria-hidden', 'true')
    document.body.style.overflow = ''
    canvas.innerHTML = ''
    currentSvg = null
    scale = 1; tx = 0; ty = 0
  }

  closeBtn.addEventListener('click', closeModal)
  resetBtn.addEventListener('click', resetView)

  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('open')) return
    if (e.key === 'Escape') closeModal()
    if (e.key === '0') resetView()
  })

  // Pan
  canvas.addEventListener('mousedown', (e) => {
    if (!currentSvg) return
    isDragging = true
    canvas.classList.add('dragging')
    startX = e.clientX; startY = e.clientY
    startTx = tx; startTy = ty
    e.preventDefault()
  })
  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return
    tx = startTx + (e.clientX - startX)
    ty = startTy + (e.clientY - startY)
    applyTransform()
  })
  window.addEventListener('mouseup', () => {
    isDragging = false
    canvas.classList.remove('dragging')
  })

  // Zoom (wheel)
  canvas.addEventListener('wheel', (e) => {
    if (!currentSvg) return
    e.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const delta = -e.deltaY * 0.0015
    const newScale = Math.max(0.1, Math.min(8, scale * (1 + delta)))
    // Zoom around cursor
    tx = mx - (mx - tx) * (newScale / scale)
    ty = my - (my - ty) * (newScale / scale)
    scale = newScale
    applyTransform()
  }, { passive: false })
})()
</script>`
}
