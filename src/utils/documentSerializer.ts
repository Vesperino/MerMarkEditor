const STRIP_ATTRS = [
  'contenteditable',
  'data-node-view-wrapper',
  'data-node-view-content-editable',
  'draggable',
  'tabindex',
  'spellcheck',
  'autocorrect',
  'autocapitalize',
  'autocomplete',
  'translate',
];

function stripAppAttributes(el: Element): void {
  for (const attr of STRIP_ATTRS) {
    el.removeAttribute(attr);
  }
  for (const child of el.children) {
    stripAppAttributes(child);
  }
}

function inlineTaskCheckboxes(clone: HTMLElement): void {
  const checkboxes = Array.from(
    clone.querySelectorAll('input[type="checkbox"]'),
  ) as HTMLInputElement[];
  for (const cb of checkboxes) {
    const span = document.createElement('span');
    span.className = cb.checked ? 'task-cb task-cb--checked' : 'task-cb';
    span.textContent = cb.checked ? '☑' : '☐';
    cb.replaceWith(span);
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function isDarkColor(color: string | null): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  if (c === 'none' || c === 'transparent') return false;
  // Match #rgb/#rrggbb
  const hex = c.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    if (h.length < 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum < 0.5;
  }
  // Common Mermaid dark theme keywords
  return /^(black|dark|#1[a-f]|#2[a-f])/.test(c);
}

/**
 * Mermaid renders text labels inside <foreignObject> with HTML divs.
 * Those rely on CSS scoped to the live Mermaid component.
 * When cloned into a print iframe that CSS is gone, so labels disappear.
 * Convert each foreignObject to a plain SVG <text> with the same content.
 */
function convertForeignObjectsToText(svg: Element): void {
  const fos = Array.from(svg.querySelectorAll('foreignObject'));
  for (const fo of fos) {
    const x = parseFloat(fo.getAttribute('x') ?? '0');
    const y = parseFloat(fo.getAttribute('y') ?? '0');
    const w = parseFloat(fo.getAttribute('width') ?? '0');
    const h = parseFloat(fo.getAttribute('height') ?? '0');
    const raw = (fo.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!raw) {
      fo.remove();
      continue;
    }
    const cx = x + w / 2;
    const cy = y + h / 2;
    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', String(cx));
    text.setAttribute('y', String(cy));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('font-size', '12');
    text.setAttribute('font-family', 'inherit');
    text.setAttribute('fill', '#1a1a1a');
    text.textContent = raw;
    fo.replaceWith(text);
  }
}

/**
 * When the app is in dark mode, MermaidNode injects a high-priority
 * <style id="mermark-mermaid-dark-override"> block inside the SVG with
 * !important rules that force dark fills/strokes/text. That cascade beats
 * any fill="white" we set, so PDFs print as dark blobs. Strip it for print.
 */
function stripDarkOverrideStyle(svg: Element): void {
  const override = svg.querySelector('style#mermark-mermaid-dark-override');
  if (override) override.remove();
}

/**
 * Strip any inline style attributes setting fill/stroke/color with !important
 * priority on individual elements — dark-mode repaint also calls
 * `el.style.setProperty('fill', ..., 'important')`, which survives the clone
 * and overrides our attribute-level recoloring.
 */
function stripImportantInlineColors(svg: Element): void {
  const styled = Array.from(svg.querySelectorAll<HTMLElement | SVGElement>('[style]'));
  for (const el of styled) {
    const s = el.style;
    if (s.getPropertyPriority('fill') === 'important') s.removeProperty('fill');
    if (s.getPropertyPriority('stroke') === 'important') s.removeProperty('stroke');
    if (s.getPropertyPriority('color') === 'important') s.removeProperty('color');
    if (s.getPropertyPriority('background-color') === 'important') s.removeProperty('background-color');
  }
}

/**
 * Mermaid dark theme paints a dark background rect first.
 * For print, force light backgrounds and dark text to keep readability.
 */
function normalizeMermaidColors(svg: Element): void {
  // Backgrounds: any rect/path with dark fill becomes white
  const fills = Array.from(svg.querySelectorAll('[fill]')) as Element[];
  for (const el of fills) {
    const fill = el.getAttribute('fill');
    if (isDarkColor(fill)) {
      el.setAttribute('fill', '#ffffff');
    }
  }
  // Strip inline dark fill from style attribute too
  const styled = Array.from(svg.querySelectorAll('[style]')) as Element[];
  for (const el of styled) {
    const style = el.getAttribute('style') ?? '';
    const m = style.match(/(?:^|;)\s*fill:\s*([^;]+)/i);
    if (m && isDarkColor(m[1])) {
      const cleaned = style.replace(/(?:^|;)\s*fill:\s*[^;]+;?/i, '');
      el.setAttribute('style', cleaned + ';fill:#ffffff');
    }
  }
  // Light-colored text → dark for contrast on white bg
  const texts = Array.from(svg.querySelectorAll('text, tspan')) as Element[];
  for (const t of texts) {
    const fill = t.getAttribute('fill');
    if (!fill || !isDarkColor(fill)) {
      t.setAttribute('fill', '#1a1a1a');
    }
  }
}

function findDiagramSvg(node: Element): SVGElement | null {
  // Preferred: SVG inside .mermaid-content (where Mermaid.run() injects it)
  const inContent = node.querySelector('.mermaid-content svg');
  if (inContent) return inContent as SVGElement;
  // Fallback: first SVG that is NOT inside the toolbar (icons live there)
  const allSvgs = Array.from(node.querySelectorAll('svg'));
  const diagram = allSvgs.find(s => !s.closest('.mermaid-toolbar'));
  return (diagram as SVGElement | undefined) ?? null;
}

const PRINT_LIGHT_OVERRIDE_ID = 'mermark-print-light-override';

/**
 * Mermaid's internal <style> uses class selectors (`.cluster rect`, `.node rect`)
 * to set dark fills baked from themeVariables. Those don't show up as `fill`
 * attributes, so attribute-based recoloring misses them. Inject a final
 * <style> with !important light values to override whatever Mermaid emitted.
 */
function injectPrintLightOverride(svg: Element): void {
  const style = document.createElementNS(SVG_NS, 'style');
  style.id = PRINT_LIGHT_OVERRIDE_ID;
  style.textContent = `
    g.node rect, g.node polygon, g.node ellipse, g.node circle, g.node path:not(.arrowMarkerPath),
    .label-container, .basic.label-container {
      fill: #ffffff !important;
      stroke: #333333 !important;
    }
    .cluster rect, .cluster polygon {
      fill: #f4f6f8 !important;
      stroke: #aaaaaa !important;
    }
    text, tspan, .nodeLabel, .edgeLabel, .cluster-label {
      fill: #1a1a1a !important;
      color: #1a1a1a !important;
    }
    .edgeLabel rect, .edgeLabel foreignObject { fill: #ffffff !important; background: #ffffff !important; }
    .edgePath path:not(.arrowMarkerPath), .flowchart-link, path.path,
    line, .messageLine0, .messageLine1 {
      stroke: #333333 !important;
    }
    marker path { fill: #333333 !important; stroke: #333333 !important; }
    /* Sequence diagram actors / gantt */
    .actor { fill: #f4f6f8 !important; stroke: #333333 !important; }
    .section0, .section1 { fill: #f0f0f0 !important; }
    .task { fill: #d0e0f0 !important; stroke: #333333 !important; }
  `;
  svg.appendChild(style);
}

function inlineMermaidSvgs(clone: HTMLElement): void {
  const mermaidNodes = Array.from(clone.querySelectorAll('[data-code]'));
  for (const node of mermaidNodes) {
    const svg = findDiagramSvg(node);
    const figure = document.createElement('figure');
    figure.className = 'mermaid-print-figure';
    if (svg) {
      const svgClone = svg.cloneNode(true) as SVGElement;
      svgClone.removeAttribute('width');
      svgClone.removeAttribute('height');
      // Wipe any background-color set by Mermaid's dark theme on the root SVG
      svgClone.style.cssText = '';
      svgClone.style.maxWidth = '100%';
      svgClone.style.height = 'auto';
      svgClone.style.background = '#ffffff';
      stripDarkOverrideStyle(svgClone);
      stripImportantInlineColors(svgClone);
      convertForeignObjectsToText(svgClone);
      normalizeMermaidColors(svgClone);
      injectPrintLightOverride(svgClone);
      figure.appendChild(svgClone);
    }
    node.replaceWith(figure);
  }
}

/**
 * Slugify a heading label for use as an HTML id. Lowercase, ASCII letters/digits
 * only, hyphens for separators. Collisions resolved by `-2`, `-3` suffixes via
 * the seen-set passed in.
 */
export function slugifyHeading(text: string, seen: Set<string>): string {
  const base = (text || 'section')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';
  let id = base;
  let n = 2;
  while (seen.has(id)) id = `${base}-${n++}`;
  seen.add(id);
  return id;
}

/**
 * Walk H1-H6 elements and assign id="pdf-h-..." for anchor targeting.
 * Skips headings inside the footnotes section (those have their own ids).
 * Returns the mapping in document order for TOC generation.
 */
export interface HeadingInfo {
  level: number;
  text: string;
  id: string;
}

export function assignHeadingIds(root: HTMLElement): HeadingInfo[] {
  const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  const seen = new Set<string>();
  const out: HeadingInfo[] = [];
  for (const h of headings) {
    if (h.closest('[data-footnotes], section.footnotes, nav.pdf-toc')) continue;
    const text = (h.textContent ?? '').trim();
    const id = h.id || `pdf-h-${slugifyHeading(text, seen)}`;
    h.id = id;
    out.push({ level: Number(h.tagName.charAt(1)), text, id });
  }
  return out;
}

/**
 * The live editor renders the footnote section through a Vue NodeView
 * (FootnoteNode.vue), which produces UI chrome (edit textareas, backlink
 * buttons, index spans) rather than the canonical `<section data-footnotes>`
 * + `<li data-footnote-id="LABEL">` form that linkifyFootnotes expects.
 * Rebuild the clean print form from the visible content so anchor wiring
 * downstream finds matching targets.
 */
export function normalizeFootnoteSection(root: HTMLElement): void {
  const wrappers = Array.from(root.querySelectorAll('.footnote-section-wrapper'));
  for (const wrapper of wrappers) {
    const items = Array.from(wrapper.querySelectorAll<HTMLElement>('li.footnote-item'));
    if (!items.length) {
      wrapper.remove();
      continue;
    }
    const section = document.createElement('section');
    section.className = 'footnotes';
    section.setAttribute('data-footnotes', '');
    const ol = document.createElement('ol');
    for (const item of items) {
      const label = item.getAttribute('data-footnote-label') ?? '';
      if (!label) continue;
      const contentEl = item.querySelector('.footnote-def-content');
      const editEl = item.querySelector<HTMLTextAreaElement>('.footnote-edit-input');
      const text = (editEl?.value ?? contentEl?.textContent ?? '').trim();
      const li = document.createElement('li');
      li.setAttribute('data-footnote-id', label);
      const p = document.createElement('p');
      p.textContent = text;
      li.appendChild(p);
      ol.appendChild(li);
    }
    section.appendChild(document.createElement('hr'));
    section.appendChild(ol);
    wrapper.replaceWith(section);
  }
}

/**
 * Convert TipTap footnote markup into clickable internal links:
 *   - Each <sup class="footnote-ref" data-footnote-ref="LABEL">N</sup>
 *     becomes <sup id="fnref-LABEL"><a href="#fn-LABEL">N</a></sup>
 *   - Each footnote definition <li data-footnote-id="LABEL"><p>...</p></li>
 *     gets id="fn-LABEL" + a back-reference <a href="#fnref-LABEL">↩</a>
 */
export function linkifyFootnotes(root: HTMLElement): void {
  const refs = Array.from(root.querySelectorAll('sup[data-footnote-ref]'));
  for (const ref of refs) {
    const label = ref.getAttribute('data-footnote-ref') ?? '';
    if (!label) continue;
    if (!ref.id) ref.id = `fnref-${label}`;
    const number = ref.textContent ?? '';
    ref.innerHTML = '';
    const a = document.createElement('a');
    a.href = `#fn-${label}`;
    a.textContent = number;
    ref.appendChild(a);
  }

  const defs = Array.from(root.querySelectorAll('li[data-footnote-id]'));
  for (const li of defs) {
    const label = li.getAttribute('data-footnote-id') ?? '';
    if (!label) continue;
    if (!li.id) li.id = `fn-${label}`;
    const lastP = li.querySelector('p:last-of-type') ?? li;
    const back = document.createElement('a');
    back.href = `#fnref-${label}`;
    back.className = 'fn-back';
    back.textContent = ' ↩';
    back.setAttribute('aria-label', 'back');
    lastP.appendChild(back);
  }
}

/**
 * Serializes the live TipTap editor DOM into a clean HTML string suitable
 * for injection into a print iframe or DOCX conversion.
 * Deep-clones the element, inlines Mermaid SVGs, strips interactive attrs,
 * assigns heading IDs, and wires footnote anchor pairs.
 */
export function serializeEditorContent(editorEl: HTMLElement): string {
  const clone = editorEl.cloneNode(true) as HTMLElement;
  inlineMermaidSvgs(clone);
  inlineTaskCheckboxes(clone);
  normalizeFootnoteSection(clone);
  assignHeadingIds(clone);
  linkifyFootnotes(clone);
  stripAppAttributes(clone);
  return clone.innerHTML;
}
