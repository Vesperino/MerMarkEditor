import { createDocument, getHTMLFromFragment } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';

/** Keep inline spaces/tabs on initial load and setContent alike. Together with
 * normalizeVisualHtml, this makes the imported editor and source baseline use
 * the same whitespace policy, including after saving or reopening a file. */
export const VISUAL_PARSE_OPTIONS = { preserveWhitespace: true } as const;

/** Ignore layout whitespace between blocks without collapsing editable text.
 * Code blocks and atomic raw-HTML node source remain verbatim. The editor must
 * import this form too: with preserveWhitespace, ProseMirror turns every
 * newline left in inline content into a hard break. */
export function normalizeVisualHtml(html: string): string {
  // Detached elements in the active document can load images and run handlers.
  const root = document.implementation.createHTMLDocument('').createElement('div');
  root.innerHTML = html;
  const walk = (element: Element) => {
    if (element.matches('pre, [data-safe-html-block]')) return;
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

let visualSchema: Schema | null = null;
let recentEditorOutput: string[] = [];

export function registerVisualSchema(schema: Schema): void {
  visualSchema = schema;
}

export const currentVisualSchema = (): Schema | null => visualSchema;

/** getHTML() output is already in schema form; saves can skip reparsing it. */
export function rememberEditorOutput(html: string): void {
  recentEditorOutput = [html, ...recentEditorOutput.filter(h => h !== html)].slice(0, 3);
}

/** The HTML the visual editor holds after importing `html`, or null before an
 * editor exists. The schema reshapes some markup (an image inside a paragraph
 * becomes its own block), so a save baseline must pass through it as well. */
export function editorHtml(html: string): string | null {
  if (!visualSchema) return null;
  if (recentEditorOutput.includes(html)) return html;
  const doc = createDocument(normalizeVisualHtml(html), visualSchema, VISUAL_PARSE_OPTIONS);
  return getHTMLFromFragment(doc.content, visualSchema);
}
