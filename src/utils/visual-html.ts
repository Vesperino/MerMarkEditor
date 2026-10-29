/** Keep inline spaces/tabs on initial load and setContent alike. Together with
 * normalizeVisualHtml, this makes the imported editor and source baseline use
 * the same whitespace policy, including after saving or reopening a file. */
export const VISUAL_PARSE_OPTIONS = { preserveWhitespace: true } as const;

/** Ignore layout whitespace between blocks without collapsing editable text.
 * Code and atomic raw-HTML node source remain verbatim. */
export function normalizeVisualHtml(html: string): string {
  // Detached elements in the active document can load images and run handlers.
  const root = document.implementation.createHTMLDocument('').createElement('div');
  root.innerHTML = html;
  const walk = (element: Element) => {
    if (element.matches('pre, code, [data-safe-html-block]')) return;
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = (node.textContent ?? '').replace(/\r\n?|\n/g, ' ');
        if (value.trim() === '' && element.matches('div, ul, ol, blockquote, table, thead, tbody, tr')) node.remove();
        else node.textContent = value;
      } else if (node.nodeType === Node.ELEMENT_NODE) walk(node as Element);
    }
  };
  walk(root);
  return root.innerHTML;
}
