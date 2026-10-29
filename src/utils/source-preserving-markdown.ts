import { diffChars, diffLines } from 'diff';
import { applyLineEnding, detectLineEnding, htmlToMarkdown, markdownToHtml } from './markdown-converter';
import { sourceBoundaries } from './markdown-source-alignment';
import { getCurrentMermaidReadFormats, getCurrentMermaidWriteFormat } from './mermaid-formats';
import { normalizeVisualHtml } from './visual-html';

interface Edit { start: number; end: number; text: string }

const canonicalize = (source: string): string => htmlToMarkdown(normalizeVisualHtml(markdownToHtml(source)));

// Retain at most two revisions and two million UTF-16 code units total. A
// validated save is also the next revision's canonical baseline, so a later
// save need not parse the whole source again. Converter settings are mutable.
const canonicalSources = new Map<string, string>();
let cacheSettings = '';
let cacheSize = 0;
function rememberCanonical(source: string, canonical: string) {
  const size = source.length + canonical.length;
  if (size > 2_000_000 || canonicalSources.has(source)) return;
  while (canonicalSources.size >= 2 || cacheSize + size > 2_000_000) {
    const key = canonicalSources.keys().next().value!;
    cacheSize -= key.length + canonicalSources.get(key)!.length;
    canonicalSources.delete(key);
  }
  canonicalSources.set(source, canonical);
  cacheSize += size;
}

function sourceCanonical(source: string): string {
  const settings = JSON.stringify([getCurrentMermaidReadFormats(), getCurrentMermaidWriteFormat()]);
  if (settings !== cacheSettings) {
    canonicalSources.clear();
    cacheSize = 0;
    cacheSettings = settings;
  }
  const cached = canonicalSources.get(source);
  if (cached !== undefined) return cached;
  const canonical = canonicalize(source);
  rememberCanonical(source, canonical);
  return canonical;
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
  const baseline = sourceCanonical(source);
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
        // Deleting generated whitespace must consume its source gap as well;
        // otherwise deleting a wrapped word leaves a spurious blank line.
        const beforeGap = /\s/.test(baseline[edit.start] ?? '')
          || (edit.start === edit.end && edit.start === baseline.length);
        const start = lines || beforeGap ? boundaries.left[edit.start] : boundaries.right[edit.start];
        const end = lines ? boundaries.right[edit.end] : boundaries.left[edit.end];
        result = result.slice(0, start) + edit.text + result.slice(Math.max(start, end));
      }
      if (canonicalize(result) === current) {
        const saved = applyLineEnding(result, detectLineEnding(source));
        rememberCanonical(saved, current);
        return saved;
      }
    }
  }
  return applyLineEnding(current, detectLineEnding(source));
}
