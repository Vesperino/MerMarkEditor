import { diffChars, diffLines } from 'diff';
import { applyLineEnding, detectLineEnding, htmlToMarkdown, markdownToHtml } from './markdown-converter';

interface Edit { start: number; end: number; text: string }

// TipTap removes whitespace between blocks and collapses HTML text whitespace
// on import. Apply that normalization to both sides, so loading alone is never
// mistaken for a user edit. Code and raw-HTML node source remain verbatim.
function normalizeVisualHtml(html: string): string {
  // A detached element in the active document can still load images and run
  // their event handlers. Normalize in an inert document, never mounted in UI.
  const root = document.implementation.createHTMLDocument('').createElement('div');
  root.innerHTML = html;
  const walk = (element: Element) => {
    if (element.matches('pre, code, [data-safe-html-block]')) return;
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const value = (node.textContent ?? '').replace(/[\t\r\n ]+/g, ' ');
        if (value.trim() === '' && element.matches('div, ul, ol, blockquote, table, thead, tbody, tr')) node.remove();
        else node.textContent = value;
      } else if (node.nodeType === Node.ELEMENT_NODE) walk(node as Element);
    }
  };
  walk(root);
  return root.innerHTML;
}

const canonicalize = (source: string): string => htmlToMarkdown(normalizeVisualHtml(markdownToHtml(source)));

/** Map boundaries in generated Markdown back to the original source. Two
 * positions retain gaps discarded by conversion (wrapping, alternate markers,
 * blank lines), so text edits can leave those gaps alone. */
function sourceBoundaries(source: string, generated: string) {
  const changes = diffChars(source, generated, { timeout: 200 });
  if (!changes) return null;
  const left = new Array<number>(generated.length + 1);
  const right = new Array<number>(generated.length + 1);
  let original = 0;
  let offset = 0;
  left[0] = right[0] = 0;
  for (const change of changes) {
    if (change.removed) {
      original += change.value.length;
      right[offset] = original;
    } else {
      for (let i = 0; i < change.value.length; i++) {
        if (!change.added) original++;
        offset++;
        left[offset] = right[offset] = original;
      }
    }
  }
  return { left, right };
}

function editsBetween(before: string, after: string, lines = false): Edit[] | null {
  const changes = lines
    ? diffLines(before, after, { timeout: 200 })
    : diffChars(before, after, { timeout: 200 });
  if (!changes) return null;
  const edits: Edit[] = [];
  let offset = 0;
  let edit: Edit | null = null;
  for (const change of changes) {
    if (!change.added && !change.removed) {
      if (edit) edits.push(edit);
      edit = null;
      offset += change.value.length;
      continue;
    }
    edit ??= { start: offset, end: offset, text: '' };
    if (change.removed) {
      offset += change.value.length;
      edit.end = offset;
    } else edit.text += change.value;
  }
  if (edit) edits.push(edit);
  return edits;
}

/** Serialize visual edits against the source, preserving untouched Markdown.
 * Validate the result through the parser before returning it: syntax changes
 * may need whole generated lines, while ordinary typing needs only characters.
 * Bound diff work and fall back to the normal serializer for ambiguous edits. */
export function sourcePreservingMarkdown(html: string, source?: string | null): string {
  if (source == null) return htmlToMarkdown(html);
  const current = htmlToMarkdown(normalizeVisualHtml(html));
  const baseline = canonicalize(source);
  if (baseline === current) return source;
  if (current === '') return '';

  const normalized = source.replace(/\r\n?|\n/g, '\n');
  const boundaries = sourceBoundaries(normalized, baseline);
  if (boundaries) {
    for (const lines of [false, true]) {
      const edits = editsBetween(baseline, current, lines);
      if (!edits) break;
      let result = normalized;
      for (const edit of edits.reverse()) {
        // Character edits preserve discarded source gaps. Whole-line edits
        // also replace alternate delimiters when the visual structure changes.
        // A caret before generated whitespace belongs before its original gap
        // too (e.g. before the newline that rendered as a soft-break space).
        const beforeGap = edit.start === edit.end && /\s/.test(baseline[edit.start] ?? '');
        const start = lines || beforeGap ? boundaries.left[edit.start] : boundaries.right[edit.start];
        const end = lines ? boundaries.right[edit.end] : boundaries.left[edit.end];
        result = result.slice(0, start) + edit.text + result.slice(Math.max(start, end));
      }
      if (canonicalize(result) === current) {
        return applyLineEnding(result, detectLineEnding(source));
      }
    }
  }
  return applyLineEnding(current, detectLineEnding(source));
}
