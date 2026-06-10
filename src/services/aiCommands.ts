import { invoke } from '@tauri-apps/api/core';
import { listen, type Event, type UnlistenFn } from '@tauri-apps/api/event';

export type CliKind = 'claude' | 'codex' | 'ollama' | 'openai';

export interface HealthStatus {
  ok: boolean;
  version: string | null;
  account: string | null;
  error: string | null;
  resolvedPath: string | null;
}

export interface AccessMapTools {
  bash: boolean;
  network: boolean;
  fileRead: boolean;
  fileWrite: boolean;
}

export interface AccessMap {
  readPaths: string[];
  writePaths: string[];
  tools: AccessMapTools;
}

export interface SessionMapping {
  docPath: string;
  cli: CliKind;
  sessionId: string;
  lastUsed: string;
  contentHash: string;
}

export interface SnapshotIndexEntry {
  id: string;
  ts: string;
  sourceSessionId: string | null;
  pinned: boolean;
  contentHash: string;
  byteSize: number;
}

export interface AuditEntry {
  ts: string;
  sessionId: string | null;
  cli: CliKind;
  action: string;
  args: unknown;
  result: unknown;
  exitCode: number | null;
}

/** A model entry from the codex CLI's models_cache.json (slug + display name). */
export interface CodexModelInfo {
  id: string;
  label: string;
}

/** A prior conversation turn carried into a LOCAL-provider request (ollama /
 *  openai). claude/codex resume via sessionId and ignore this. */
export interface AiHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiSendRequest {
  cli: CliKind;
  sessionId: string | null;
  model: string | null;
  effort: string | null;
  prompt: string;
  preamble: string;
  /** Per-turn context (pins, unsaved/large-doc notes, mermaid mode) — sent every turn. */
  turnContext: string;
  accessMap: AccessMap;
  bypass: boolean;
  workDir: string;
  /** Absolute paths to attached image files. */
  images?: string[];
  /** Optional explicit path to the CLI binary (overrides PATH-based detection). */
  cliPath?: string | null;
  /** Prior turns for local providers only; empty/omitted for claude/codex. */
  history?: AiHistoryTurn[];
  /** Ollama runtime window (options.num_ctx); null/omitted for other providers. */
  numCtx?: number | null;
  /** Current main-document content, attached fresh per send for local providers
   *  (size-gated in AiPanel); null/omitted for claude/codex or oversized docs. */
  docContent?: string | null;
}

export type AiResponseChunk =
  | { kind: 'text'; content: string }
  | { kind: 'tool_request'; tool: string; args: unknown; requestId: string }
  | { kind: 'tool_denied'; tool: string; reason: string }
  | { kind: 'done'; sessionId: string; usage: unknown | null }
  | { kind: 'error'; message: string; exitCode: number | null };

export const aiCommands = {
  healthCheck: (cli: CliKind, overridePath: string | null = null) =>
    invoke<HealthStatus>('ai_health_check', { cli, overridePath }),

  /** List models installed in a local Ollama via GET /api/tags. */
  ollamaModels: (baseUrl: string | null = null) =>
    invoke<string[]>('ai_ollama_models', { baseUrl }),

  /** List models a local OpenAI-compatible server exposes via GET /v1/models. */
  openaiModels: (baseUrl: string | null = null) =>
    invoke<string[]>('ai_openai_models', { baseUrl }),

  /** List models from the codex CLI's models_cache.json (empty when missing). */
  codexModels: () => invoke<CodexModelInfo[]>('ai_codex_models'),

  send: (req: AiSendRequest, requestId: string) => invoke<string>('ai_send', { req, requestId }),
  cancel: (requestId: string) => invoke<void>('ai_cancel', { requestId }),

  /** Persist an image (clipboard / drag-drop) to a tmp file and return its path. */
  imageSave: (bytes: Uint8Array, extension: string) =>
    invoke<string>('ai_image_save', { bytes: Array.from(bytes), extension }),

  accessLoad: (docPath: string) => invoke<AccessMap>('ai_access_load', { docPath }),
  accessSave: (docPath: string, map: AccessMap) => invoke<void>('ai_access_save', { docPath, map }),
  accessMigrate: (oldPath: string, newPath: string) => invoke<void>('ai_access_migrate', { oldPath, newPath }),

  sessionGet: (docPath: string) => invoke<SessionMapping | null>('ai_session_get', { docPath }),
  sessionUpsert: (mapping: SessionMapping) => invoke<void>('ai_session_upsert', { mapping }),
  sessionRemove: (docPath: string) => invoke<void>('ai_session_remove', { docPath }),
  sessionMigrate: (oldPath: string, newPath: string) => invoke<void>('ai_session_migrate', { oldPath, newPath }),
  sessionRecoverByHash: (contentHash: string, cli: CliKind) =>
    invoke<SessionMapping | null>('ai_session_recover_by_hash', { contentHash, cli }),

  snapshotList: (docPath: string) => invoke<SnapshotIndexEntry[]>('ai_snapshot_list', { docPath }),
  snapshotCreate: (docPath: string, content: string, sourceSessionId: string | null, keep: number) =>
    invoke<SnapshotIndexEntry>('ai_snapshot_create', { docPath, content, sourceSessionId, keep }),
  snapshotRestore: (docPath: string, id: string) => invoke<string>('ai_snapshot_restore', { docPath, id }),
  snapshotSetPinned: (docPath: string, id: string, pinned: boolean) =>
    invoke<void>('ai_snapshot_set_pinned', { docPath, id, pinned }),
  snapshotDelete: (docPath: string, id: string) => invoke<void>('ai_snapshot_delete', { docPath, id }),
  snapshotExport: (docPath: string, id: string, dest: string) =>
    invoke<void>('ai_snapshot_export', { docPath, id, dest }),
  snapshotMigrate: (oldPath: string, newPath: string) =>
    invoke<void>('ai_snapshot_migrate', { oldPath, newPath }),

  auditAppend: (entry: AuditEntry) => invoke<void>('ai_audit_append', { entry }),
  auditRead: (since: string | null = null, until: string | null = null) =>
    invoke<AuditEntry[]>('ai_audit_read', { since, until }),
  auditClear: () => invoke<void>('ai_audit_clear'),

  /** Subscribe to streaming chunks for a request. Returns the unlisten fn. */
  onStream: (
    requestId: string,
    handler: (chunk: AiResponseChunk) => void,
  ): Promise<UnlistenFn> =>
    listen<AiResponseChunk>(`ai:stream:${requestId}`, (e: Event<AiResponseChunk>) => handler(e.payload)),
};
