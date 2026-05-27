export interface MermaidDelimiters {
  open: string;
  close: string;
}

export const DEFAULT_MERMAID_DELIMITERS: MermaidDelimiters = {
  open: '```mermaid',
  close: '```',
};

const SETTINGS_KEY = 'mermark-settings';

function readStoredDelimiters(): MermaidDelimiters {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_MERMAID_DELIMITERS };
  }

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_MERMAID_DELIMITERS };
    const parsed = JSON.parse(raw) as {
      mermaidFenceOpen?: unknown;
      mermaidFenceClose?: unknown;
    };
    return normalizeMermaidDelimiters({
      open: typeof parsed.mermaidFenceOpen === 'string' ? parsed.mermaidFenceOpen : undefined,
      close: typeof parsed.mermaidFenceClose === 'string' ? parsed.mermaidFenceClose : undefined,
    });
  } catch {
    return { ...DEFAULT_MERMAID_DELIMITERS };
  }
}

let currentMermaidDelimiters: MermaidDelimiters = readStoredDelimiters();

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
  return { ...currentMermaidDelimiters };
}

export function setCurrentMermaidDelimiters(input?: Partial<MermaidDelimiters> | null): void {
  currentMermaidDelimiters = normalizeMermaidDelimiters(input);
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createMermaidBlockRegex(
  delimiters: MermaidDelimiters = getCurrentMermaidDelimiters(),
): RegExp {
  const { open, close } = normalizeMermaidDelimiters(delimiters);
  return new RegExp(
    `(?:<!--mermaid-attrs:([^>]*?)-->\\s*\\n)?${escapeRegExp(open)}\\s*\\n([\\s\\S]*?)\\n${escapeRegExp(close)}(?=\\s*(?:\\n|$))`,
    'gi',
  );
}

export function buildMermaidBlock(
  code: string,
  delimiters: MermaidDelimiters = getCurrentMermaidDelimiters(),
): string {
  const { open, close } = normalizeMermaidDelimiters(delimiters);
  return `${open}\n${code}\n${close}`;
}
