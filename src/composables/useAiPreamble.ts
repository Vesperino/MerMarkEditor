import type { AccessMap } from '../services/aiCommands';
import type { MermaidFormat } from '../utils/mermaid-formats';

export interface PinnedRef {
  id: string;
  text: string;
}

export interface PreambleOptions {
  pins: PinnedRef[];
  includePins: boolean;
  selectionRange: { start: number; end: number } | null;
  accessMap: AccessMap | null;
  docPath: string;
  docNeedsSave: boolean;
  docTooLarge: boolean;
  sendFullDocOverride: boolean;
  docMarkdownLength: number;
  localeKey: string;
  /** Name of the workspace (folder) owning the active file, if any. */
  workspaceName?: string;
  /** Absolute root path of the workspace, if any. */
  workspaceRoot?: string;
  /** True when the panel is bound to a Mermaid edit target (see useAiMermaidTarget).
   *  Adds instructions steering the model toward a single ```mermaid``` reply. */
  mermaidEditMode?: boolean;
  /** Format to instruct the model to use when emitting the diagram. The editor
   *  parses any enabled read format, but pinning the write format means the
   *  AI reply round-trips through save without delimiter swaps. */
  mermaidWriteFormat?: MermaidFormat;
}

interface PinScopeStrings {
  header: (n: number) => string;
  rule: string;
  reply: string;
}

export const PIN_SCOPE_INSTRUCTIONS: Record<string, PinScopeStrings> = {
  en: {
    header: (n) => `The user attached ${n} fragment(s) below.`,
    rule: 'Unless the user explicitly says otherwise, treat the user\'s request as applying to THESE fragments specifically — not the whole document. Apply transformations / translations / edits to the attached fragments only.',
    reply: 'Reply in the same language as the user\'s most recent message.',
  },
  pl: {
    header: (n) => `Użytkownik załączył poniżej ${n} fragment(ów).`,
    rule: 'Jeśli użytkownik wyraźnie nie zaznaczy inaczej, traktuj jego polecenie jako odnoszące się DO TYCH fragmentów — nie do całego dokumentu. Wszelkie przekształcenia / tłumaczenia / edycje stosuj tylko do załączonych fragmentów.',
    reply: 'Odpowiadaj w tym samym języku co ostatnia wiadomość użytkownika.',
  },
  'zh-CN': {
    header: (n) => `用户在下方附加了 ${n} 个片段。`,
    rule: '除非用户明确说明，否则将用户的请求视为仅针对这些片段，而不是整个文档。所有转换/翻译/编辑只应用于附加的片段。',
    reply: '请使用与用户最近一条消息相同的语言回复。',
  },
};

export function buildPreamble(opts: PreambleOptions): string {
  let selSection = 'Selection: none';
  if (opts.pins.length > 0 && opts.includePins) {
    const blocks = opts.pins.map((p, i) => {
      const truncated = p.text.length > 4000 ? p.text.slice(0, 4000) + '…' : p.text;
      return `Pinned #${i + 1}:\n---\n${truncated}\n---`;
    });
    const ins = PIN_SCOPE_INSTRUCTIONS[opts.localeKey] ?? PIN_SCOPE_INSTRUCTIONS.en;
    const n = opts.pins.length;
    selSection = [
      ins.header(n),
      ins.rule,
      ins.reply,
      '',
      blocks.join('\n\n'),
    ].join('\n');
  } else if (opts.selectionRange) {
    selSection = `Selection: yes (${opts.selectionRange.start}-${opts.selectionRange.end})`;
  }
  const am = opts.accessMap;
  const tools = am
    ? Object.entries(am.tools).filter(([, v]) => v).map(([k]) => k).join(',') || 'none'
    : 'unknown';
  const mainFileLine = opts.docPath
    ? `Main file (the document the user is editing — your only writable target): ${opts.docPath}`
    : 'Main file: (unsaved — no edits possible until user saves)';
  const workspaceLines = opts.workspaceRoot
    ? [
        `Workspace: ${opts.workspaceName || opts.workspaceRoot}`,
        `Workspace root (read-only context): ${opts.workspaceRoot}`,
        `The main file lives inside this workspace. You may READ other files in the workspace for context (notes, references, related documents) but you must only WRITE to the main file. When the user says "the project" / "this notebook" / "these notes", they mean the workspace above.`,
      ]
    : [];
  const lines = [
    `You are an AI assistant integrated into the MerMark editor.`,
    ...workspaceLines,
    mainFileLine,
    selSection,
    `Read paths: ${am?.readPaths.join(', ') ?? opts.docPath}`,
    `Write paths: ${am?.writePaths.join(', ') ?? opts.docPath}`,
    `Allowed tools: ${tools}`,
    ``,
    `When the user asks for edits to the active file, USE YOUR Edit / Write TOOLS to modify the file on disk directly. Do NOT return code fences with the proposed change — the host will reload the editor from disk after you finish.`,
    ``,
    `For chat-only answers (questions about the file, summaries, suggestions), respond as plain text without editing the file.`,
  ];
  if (opts.docNeedsSave) {
    lines.push('', 'IMPORTANT: The document is not saved yet — do NOT try to use file Edit / Write tools. Answer in chat only.');
  }
  if (opts.docTooLarge && !opts.sendFullDocOverride) {
    lines.push('', `Note: the active document is large (${opts.docMarkdownLength} bytes). Focus on the first 200KB unless instructed otherwise.`);
  }
  if (opts.mermaidEditMode) {
    const open = opts.mermaidWriteFormat?.open ?? '```mermaid';
    const close = opts.mermaidWriteFormat?.close ?? '```';
    lines.push(
      '',
      'MERMAID EDIT MODE — the user is editing a mermaid diagram and the pinned fragment above is its current source.',
      `Reply with ONLY one Mermaid block using exactly these delimiters: "${open}" to open and "${close}" to close. Include the full updated diagram. Preserve unrelated parts. No prose, no commentary, no other code blocks.`,
      'Do NOT call file Edit / Write tools — the host applies your reply to the diagram node directly.',
      'Stay terse — diagrams should not be cluttered with unnecessary nodes.',
    );
  }
  return lines.join('\n');
}
