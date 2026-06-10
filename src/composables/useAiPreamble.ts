import type { AccessMap, CliKind } from '../services/aiCommands';
import type { MermaidFormat } from '../utils/mermaid-formats';
import { OLLAMA_DEFAULT_NUM_CTX, OLLAMA_MIN_NUM_CTX } from './useSettings';

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
  /** True for the local HTTP providers (ollama, openai), which drive an
   *  app-side tool-calling loop with read_file/write_file/edit_file rather
   *  than the claude/codex CLI Edit/Write tools. Switches the edit
   *  instruction wording accordingly. */
  localTools?: boolean;
}

interface PinScopeStrings {
  header: (n: number) => string;
  rule: string;
  reply: string;
  markers: string;
}

export const PIN_SCOPE_INSTRUCTIONS: Record<string, PinScopeStrings> = {
  en: {
    header: (n) => `The user attached ${n} fragment(s) below.`,
    rule: 'Unless the user explicitly says otherwise, treat the user\'s request as applying to THESE fragments specifically — not the whole document. Only when the user explicitly asks for changes, apply them to the attached fragments only; for questions, opinions or discussion answer in chat and do not edit anything.',
    reply: 'Reply in the same language as the user\'s most recent message.',
    markers: 'Each fragment below is wrapped in <<< and >>> marker lines. The markers are NOT part of the document — never include them in edits or quotes.',
  },
  pl: {
    header: (n) => `Użytkownik załączył poniżej ${n} fragment(ów).`,
    rule: 'Jeśli użytkownik wyraźnie nie zaznaczy inaczej, traktuj jego polecenie jako odnoszące się DO TYCH fragmentów — nie do całego dokumentu. Zmiany wprowadzaj wyłącznie wtedy, gdy użytkownik wprost o nie prosi — i tylko w załączonych fragmentach; na pytania i prośby o opinię odpowiadaj w czacie, niczego nie edytując.',
    reply: 'Odpowiadaj w tym samym języku co ostatnia wiadomość użytkownika.',
    markers: 'Każdy fragment poniżej jest ujęty w linie-znaczniki <<< i >>>. Znaczniki NIE są częścią dokumentu — nigdy nie włączaj ich do edycji ani cytatów.',
  },
  'zh-CN': {
    header: (n) => `用户在下方附加了 ${n} 个片段。`,
    rule: '除非用户明确说明，否则将用户的请求视为仅针对这些片段，而不是整个文档。仅当用户明确要求修改时，才对附加片段进行更改；如果用户只是提问或讨论，请直接在对话中回答，不要编辑文件。',
    reply: '请使用与用户最近一条消息相同的语言回复。',
    markers: '以下每个片段都由 <<< 和 >>> 标记行包围。这些标记不是文档内容的一部分——切勿将其包含在编辑或引用中。',
  },
};

/**
 * Static facts about the editing session: identity, workspace, main file,
 * access paths/tools, edit-vs-chat directive. Sent once per provider session
 * (re-sent only when its hash changes — see shouldSendStaticPreamble).
 */
export function buildStaticPreamble(opts: PreambleOptions): string {
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
    `Read paths: ${am?.readPaths.join(', ') ?? opts.docPath}`,
    `Write paths: ${am?.writePaths.join(', ') ?? opts.docPath}`,
    `Allowed tools: ${tools}`,
    ``,
  ];
  if (opts.localTools) {
    const hasFileTools = !!(am && (am.tools.fileRead || am.tools.fileWrite));
    if (hasFileTools) {
      lines.push(
        `You have these tools available: read_file(path), list_dir(path), write_file(path, content), edit_file(path, old_string, new_string). The only writable target is the active document above; reads are limited to its folder plus any granted read paths.`,
        `To explore a granted folder, call list_dir(path) to enumerate its files and subfolders before reading individual files with read_file — read_file works on files only, not directories.`,
        `When the user asks for edits to the active file, you MUST call edit_file (for a small change) or write_file (to replace the whole file) to apply it on disk. The host reloads the editor from disk after the tools run.`,
        `read_file and list_dir are always allowed — when you need the document's current content, call read_file on the main file yourself; never ask the user to open or paste it.`,
        `The current content of the main file is attached to each message; use read_file only for OTHER files or when told the attachment was omitted.`,
        `Call edit_file / write_file ONLY when the user explicitly asks for a change. For questions, summaries, feedback or discussion, answer in chat without editing.`,
        `Before edit_file, call read_file and copy old_string EXACTLY from its output, including whitespace and line breaks — a reconstructed-from-memory old_string will not match and the edit is rejected.`,
        `Never claim in prose that you edited or updated the file — an edit only counts if you actually call edit_file / write_file. To edit, call the tools; do not paste the whole file back into chat.`,
      );
    } else {
      lines.push(
        `You have no file tools in this chat. Answer in Markdown; for diagrams reply with a \`\`\`mermaid fenced code block — the editor renders it.`,
      );
    }
  } else {
    lines.push(
      `When the user asks for edits to the active file, USE YOUR Edit / Write TOOLS to modify the file on disk directly. Do NOT return code fences with the proposed change — the host will reload the editor from disk after you finish.`,
    );
  }
  lines.push(
    ``,
    `For chat-only answers (questions about the file, summaries, suggestions), respond as plain text without editing the file.`,
  );
  return lines.join('\n');
}

/**
 * Per-turn context: pinned fragments / selection, unsaved-doc and large-doc
 * notes, mermaid edit mode. docNeedsSave and mermaid mode are safety/format
 * gates and must accompany EVERY turn. Empty string when nothing applies.
 */
export function buildTurnContext(opts: PreambleOptions): string {
  const sections: string[] = [];
  if (opts.pins.length > 0 && opts.includePins) {
    const blocks = opts.pins.map((p, i) => {
      const truncated = p.text.length > 4000 ? p.text.slice(0, 4000) + '…' : p.text;
      return `Pinned #${i + 1}:\n<<<\n${truncated}\n>>>`;
    });
    const ins = PIN_SCOPE_INSTRUCTIONS[opts.localeKey] ?? PIN_SCOPE_INSTRUCTIONS.en;
    const n = opts.pins.length;
    sections.push([
      ins.header(n),
      ins.rule,
      ins.markers,
      ins.reply,
      '',
      blocks.join('\n\n'),
    ].join('\n'));
  } else if (opts.selectionRange) {
    sections.push(`Selection: yes (${opts.selectionRange.start}-${opts.selectionRange.end})`);
  }
  if (opts.docNeedsSave) {
    sections.push('IMPORTANT: The document is not saved yet — do NOT try to use file Edit / Write tools. Answer in chat only.');
  }
  if (opts.docTooLarge && !opts.sendFullDocOverride) {
    sections.push(`Note: the active document is large (${opts.docMarkdownLength} bytes). Focus on the first 200KB unless instructed otherwise.`);
  }
  if (opts.mermaidEditMode) {
    const open = opts.mermaidWriteFormat?.open ?? '```mermaid';
    const close = opts.mermaidWriteFormat?.close ?? '```';
    sections.push([
      'MERMAID EDIT MODE — the user is editing a mermaid diagram and the pinned fragment above is its current source.',
      `Reply with ONLY one Mermaid block using exactly these delimiters: "${open}" to open and "${close}" to close. Include the full updated diagram. Preserve unrelated parts. No prose, no commentary, no other code blocks.`,
      'Do NOT call file Edit / Write tools — the host applies your reply to the diagram node directly.',
      'Stay terse — diagrams should not be cluttered with unnecessary nodes.',
    ].join('\n'));
  }
  return sections.join('\n\n');
}

/** Hard cap on the per-send document attachment for local providers. */
export const DOC_ATTACH_MAX_CHARS = 24000;

export interface DocAttachment {
  /** Document content to send as `docContent`; absent when not attached. */
  content?: string;
  /** Turn-context note when the doc was too large to attach. */
  omittedNote?: string;
}

/**
 * Per-send document attachment for the LOCAL providers (ollama/openai): weak
 * models skip the read_file round-trip when the doc rides along. Size-gated —
 * openai gets the flat cap, ollama scales with the user's num_ctx (~2 chars
 * per token of headroom). Oversized docs yield a note steering the model back
 * to read_file. claude/codex never attach (their CLIs read the file).
 */
export function buildDocAttachment(cli: CliKind, docMarkdown: string, ollamaNumCtx: number): DocAttachment {
  if (cli !== 'ollama' && cli !== 'openai') return {};
  if (!docMarkdown) return {};
  const numCtx = Number.isFinite(ollamaNumCtx)
    ? Math.max(OLLAMA_MIN_NUM_CTX, Math.floor(ollamaNumCtx))
    : OLLAMA_DEFAULT_NUM_CTX;
  const maxChars = cli === 'openai' ? DOC_ATTACH_MAX_CHARS : Math.min(DOC_ATTACH_MAX_CHARS, numCtx * 2);
  if (docMarkdown.length <= maxChars) return { content: docMarkdown };
  return { omittedNote: 'Note: the main file is too large to attach; use read_file to inspect it.' };
}

/** djb2 over the string — cheap synchronous change detection, not crypto. */
export function hashPreamble(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export interface StaticPreambleGate {
  sessionId: string | null;
  cli: CliKind;
  hasImages: boolean;
  staticHash: string;
  lastSentStaticHash: string | null;
}

export function shouldSendStaticPreamble(gate: StaticPreambleGate): boolean {
  if (!gate.sessionId) return true;
  // codex `exec resume` cannot attach images, so the backend silently forces
  // a NEW session when images are present — that fresh session never saw the
  // static preamble.
  if (gate.cli === 'codex' && gate.hasImages) return true;
  return gate.staticHash !== gate.lastSentStaticHash;
}
