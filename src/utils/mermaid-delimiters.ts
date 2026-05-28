import {
  BUILTIN_MERMAID_FORMATS,
  buildMermaidBlockFor,
  createSingleFormatRegex,
  escapeRegExp as escapeRegExpInternal,
  getCurrentMermaidWriteFormat,
  isValidFormat,
  setCurrentMermaidWriteFormat,
  type MermaidFormat,
} from './mermaid-formats';

export interface MermaidDelimiters {
  open: string;
  close: string;
}

export const DEFAULT_MERMAID_DELIMITERS: MermaidDelimiters = {
  open: BUILTIN_MERMAID_FORMATS[0].open,
  close: BUILTIN_MERMAID_FORMATS[0].close,
};

export function normalizeMermaidDelimiters(
  input?: Partial<MermaidDelimiters> | null,
): MermaidDelimiters {
  const open = typeof input?.open === 'string' ? input.open.trim() : '';
  const close = typeof input?.close === 'string' ? input.close.trim() : '';
  return {
    open: open || DEFAULT_MERMAID_DELIMITERS.open,
    close: close || DEFAULT_MERMAID_DELIMITERS.close,
  };
}

export function getCurrentMermaidDelimiters(): MermaidDelimiters {
  const fmt = getCurrentMermaidWriteFormat();
  return { open: fmt.open, close: fmt.close };
}

/** Backwards-compat: setting raw delimiters now creates an ephemeral format and
 *  installs it as the current write format. Read formats remain managed by the
 *  formats registry directly. */
export function setCurrentMermaidDelimiters(input?: Partial<MermaidDelimiters> | null): void {
  const { open, close } = normalizeMermaidDelimiters(input);
  const builtin = BUILTIN_MERMAID_FORMATS.find((f) => f.open === open && f.close === close);
  const fmt: MermaidFormat = builtin ?? {
    id: 'legacy-pair',
    open,
    close,
    label: `${open} / ${close}`,
    builtin: false,
  };
  if (isValidFormat(fmt)) setCurrentMermaidWriteFormat(fmt);
}

export const escapeRegExp = escapeRegExpInternal;

export function createMermaidBlockRegex(
  delimiters: MermaidDelimiters = getCurrentMermaidDelimiters(),
): RegExp {
  return createSingleFormatRegex(normalizeMermaidDelimiters(delimiters));
}

export function buildMermaidBlock(
  code: string,
  delimiters: MermaidDelimiters = getCurrentMermaidDelimiters(),
): string {
  const norm = normalizeMermaidDelimiters(delimiters);
  return buildMermaidBlockFor(code, {
    id: 'inline',
    open: norm.open,
    close: norm.close,
    label: '',
    builtin: false,
  });
}
