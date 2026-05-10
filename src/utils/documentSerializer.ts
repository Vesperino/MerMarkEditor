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

function inlineMermaidSvgs(clone: HTMLElement): void {
  const mermaidNodes = Array.from(clone.querySelectorAll('[data-code]'));
  for (const node of mermaidNodes) {
    const svg = node.querySelector('svg');
    const figure = document.createElement('figure');
    figure.className = 'mermaid-print-figure';
    if (svg) {
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.maxWidth = '100%';
      svg.style.height = 'auto';
      figure.appendChild(svg.cloneNode(true));
    }
    node.replaceWith(figure);
  }
}

/**
 * Serializes the live TipTap editor DOM into a clean HTML string suitable
 * for injection into a print iframe or DOCX conversion.
 * Deep-clones the element, inlines Mermaid SVGs, strips interactive attrs.
 */
export function serializeEditorContent(editorEl: HTMLElement): string {
  const clone = editorEl.cloneNode(true) as HTMLElement;
  inlineMermaidSvgs(clone);
  stripAppAttributes(clone);
  return clone.innerHTML;
}
