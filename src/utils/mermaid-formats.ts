export interface MermaidFormat {
  id: string;
  open: string;
  close: string;
  label: string;
  builtin: boolean;
}

export const STANDARD_FORMAT_ID = 'fence';

export const BUILTIN_MERMAID_FORMATS: MermaidFormat[] = [
  { id: STANDARD_FORMAT_ID, open: '```mermaid', close: '```', label: 'Standard', builtin: true },
  { id: 'admonition',       open: ':::mermaid', close: ':::',  label: 'Admonition', builtin: true },
  { id: 'tilde',            open: '~~~mermaid', close: '~~~',  label: 'Tilde',      builtin: true },
];

export const CUSTOM_FORMAT_ID = 'custom';

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isValidFormat(f: Partial<MermaidFormat> | null | undefined): f is MermaidFormat {
  return !!f
    && typeof f.id === 'string' && f.id.length > 0
    && typeof f.open === 'string' && f.open.trim().length > 0
    && typeof f.close === 'string' && f.close.trim().length > 0;
}

export function findFormatById(formats: MermaidFormat[], id: string | null | undefined): MermaidFormat | undefined {
  if (!id) return undefined;
  return formats.find((f) => f.id === id);
}

/** Regex for a single mermaid format. Captures:
 *    [1] optional `<!--mermaid-attrs:...-->` payload (persisted node attrs)
 *    [2] the diagram source between open and close fences.
 *  A multi-format scan iterates this per format and merges matches by position
 *  (see `findAllMermaidMatches`) — simpler than a single alternation regex and
 *  side-steps the group-demultiplexing problem. */
export function createSingleFormatRegex(format: Pick<MermaidFormat, 'open' | 'close'>): RegExp {
  return new RegExp(
    `(?:<!--mermaid-attrs:([^>]*?)-->\\s*\\n)?${escapeRegExp(format.open)}\\s*\\n([\\s\\S]*?)\\n${escapeRegExp(format.close)}(?=\\s*(?:\\n|$))`,
    'gi',
  );
}

export interface MermaidMatch {
  formatId: string;
  start: number;
  end: number;
  attrs: string | undefined;
  code: string;
}

/** Finds all mermaid blocks across the document under the supplied formats.
 *  When two formats overlap on the same range (e.g. user enables both
 *  Standard and a custom format that happens to also match), the earliest
 *  range wins and later matches contained inside are dropped. */
export function findAllMermaidMatches(text: string, formats: MermaidFormat[]): MermaidMatch[] {
  const matches: MermaidMatch[] = [];
  for (const fmt of formats) {
    if (!isValidFormat(fmt)) continue;
    const re = createSingleFormatRegex(fmt);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({
        formatId: fmt.id,
        start: m.index,
        end: m.index + m[0].length,
        attrs: m[1],
        code: m[2],
      });
    }
  }
  matches.sort((a, b) => a.start - b.start);
  // Drop overlaps: keep first by start, skip any whose start is before previous end.
  const dedup: MermaidMatch[] = [];
  let cursor = -1;
  for (const m of matches) {
    if (m.start >= cursor) {
      dedup.push(m);
      cursor = m.end;
    }
  }
  return dedup;
}

export function buildMermaidBlockFor(code: string, format: MermaidFormat): string {
  return `${format.open}\n${code}\n${format.close}`;
}

// ── Module-level singletons -------------------------------------------------
// Read by the markdown converter, code-view block parser, and AI extract path.
// `useSettings` updates these on init and whenever the user changes settings,
// avoiding a circular dependency between utilities and the settings composable.

let currentWriteFormat: MermaidFormat = BUILTIN_MERMAID_FORMATS[0];
let currentReadFormats: MermaidFormat[] = [...BUILTIN_MERMAID_FORMATS];

export function getCurrentMermaidWriteFormat(): MermaidFormat {
  return currentWriteFormat;
}

export function getCurrentMermaidReadFormats(): MermaidFormat[] {
  return currentReadFormats;
}

export function setCurrentMermaidWriteFormat(format: MermaidFormat | null | undefined): void {
  if (isValidFormat(format)) {
    currentWriteFormat = format;
  } else {
    currentWriteFormat = BUILTIN_MERMAID_FORMATS[0];
  }
}

export function setCurrentMermaidReadFormats(formats: MermaidFormat[] | null | undefined): void {
  const filtered = (formats ?? []).filter(isValidFormat);
  // Always keep at least the standard format so docs with `\`\`\`mermaid` still parse.
  const std = BUILTIN_MERMAID_FORMATS.find((f) => f.id === STANDARD_FORMAT_ID)!;
  const hasStd = filtered.some((f) => f.id === STANDARD_FORMAT_ID);
  currentReadFormats = hasStd ? filtered : [std, ...filtered];
}
