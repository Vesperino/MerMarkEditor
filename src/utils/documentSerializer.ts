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
      svgClone.style.maxWidth = '100%';
      svgClone.style.height = 'auto';
      convertForeignObjectsToText(svgClone);
      normalizeMermaidColors(svgClone);
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
  assignHeadingIds(clone);
  linkifyFootnotes(clone);
  stripAppAttributes(clone);
  return clone.innerHTML;
}
