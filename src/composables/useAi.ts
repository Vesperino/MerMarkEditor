import { ref, computed, watch } from 'vue';
import { aiCommands, type AiSendRequest, type AiResponseChunk, type CliKind, type AccessMap, type AiHistoryTurn } from '../services/aiCommands';
import { useAiContext } from './useAiContext';
import { useSettings, OLLAMA_MIN_NUM_CTX } from './useSettings';

export interface AttachedPin {
  id: string;
  text: string;
}

export interface AttachedImage {
  name: string;
  /** In-memory object URL for thumbnail rendering. Cleared on persist (storage
   *  cleanup) since blob: URLs do not survive page reloads. */
  blobUrl?: string;
}

export interface AiMessage {
  role: 'user' | 'assistant' | 'tool' | 'attachment';
  text: string;
  /** When role === 'tool', this carries the tool name. */
  tool?: string;
  /** When role === 'attachment', the pins sent with the next user prompt. */
  attachments?: AttachedPin[];
  /** When role === 'attachment', the images sent with the next user prompt. */
  imageAttachments?: AttachedImage[];
  error?: string;
  done: boolean;
}

export interface AiThread {
  id: string;
  /** First user prompt (truncated) — used as the visible thread title. */
  title: string;
  /** Optional CLI session-id captured from the Done event. */
  sessionId: string | null;
  cli: CliKind | null;
  /** Last model + effort used in this thread — restored on thread select. */
  model: string | null;
  effort: string | null;
  /** Hash of the static preamble last delivered in this thread (gates re-sends). */
  lastSentStaticHash: string | null;
  createdAt: string;
  updatedAt: string;
  messages: AiMessage[];
}

interface ThreadStore {
  version: 1;
  activeId: string | null;
  threads: AiThread[];
}

// ---- Persistence helpers ----
const STORAGE_PREFIX = 'mermark-ai-threads:';
const MAX_THREADS_PER_DOC = 50;
const MAX_MESSAGES_PER_THREAD = 200;
const TITLE_MAX = 60;

function storageKey(docPath: string): string {
  return STORAGE_PREFIX + docPath;
}

function emptyStore(): ThreadStore {
  return { version: 1, activeId: null, threads: [] };
}

function loadStore(docPath: string): ThreadStore {
  if (!docPath) return emptyStore();
  try {
    const raw = localStorage.getItem(storageKey(docPath));
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as ThreadStore;
    if (parsed && parsed.version === 1 && Array.isArray(parsed.threads)) {
      // Migrate threads from older versions that lacked model/effort fields.
      for (const t of parsed.threads) {
        if (t.model === undefined) t.model = null;
        if (t.effort === undefined) t.effort = null;
        if (t.lastSentStaticHash === undefined) t.lastSentStaticHash = null;
      }
      return parsed;
    }
  } catch {
    // fall through
  }
  return emptyStore();
}

function saveStore(docPath: string, store: ThreadStore) {
  if (!docPath) return;
  try {
    // Trim each thread's messages and the global thread count.
    // Strip blob: URLs from image attachments — they're invalid after page
    // reload, leaving the filename for the placeholder render path.
    const trimmed: ThreadStore = {
      version: 1,
      activeId: store.activeId,
      threads: store.threads
        .slice(-MAX_THREADS_PER_DOC)
        .map(t => ({
          ...t,
          messages: t.messages
            .slice(-MAX_MESSAGES_PER_THREAD)
            .map(m => m.imageAttachments
              ? { ...m, imageAttachments: m.imageAttachments.map(({ name }) => ({ name })) }
              : m),
        })),
    };
    localStorage.setItem(storageKey(docPath), JSON.stringify(trimmed));
  } catch (e) {
    console.error('[useAi] persist failed:', e);
  }
}

function deriveTitle(msgs: AiMessage[]): string {
  const first = msgs.find(m => m.role === 'user');
  if (!first) return 'New chat';
  const t = first.text.trim().replace(/\s+/g, ' ');
  return t.length > TITLE_MAX ? t.slice(0, TITLE_MAX - 1) + '…' : t || 'New chat';
}

/** Project prior thread turns into the wire history for local providers: only
 *  user/assistant text turns, skipping tool and attachment rows and empty or
 *  errored assistant turns (no tool_call_id references that strict servers
 *  reject). Chronological order preserved; the Rust side trims to budget. */
function buildHistory(msgs: AiMessage[]): AiHistoryTurn[] {
  const out: AiHistoryTurn[] = [];
  for (const m of msgs) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    if (m.role === 'assistant' && (m.error || !m.text)) continue;
    out.push({ role: m.role, content: m.text });
  }
  return out;
}

function newThread(): AiThread {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    sessionId: null,
    cli: null,
    model: null,
    effort: null,
    lastSentStaticHash: null,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

// ---- Module-scope reactive state (shared across all consumers) ----
const bypassEnabled = ref(false); // runtime-only — not persisted
const docPathRef = ref<string>('');
const store = ref<ThreadStore>(emptyStore());
const isSending = ref(false);
const inFlightRequestId = ref<string | null>(null);

const activeThread = computed<AiThread | null>(() => {
  if (!store.value.activeId) return null;
  return store.value.threads.find(t => t.id === store.value.activeId) ?? null;
});

// Backward-compatible `messages` ref that the panel binds to: returns the
// active thread's messages or an empty array. Mutations go via helpers below.
const messages = computed<AiMessage[]>(() => activeThread.value?.messages ?? []);

// Persist on every change.
watch(store, (s) => {
  if (docPathRef.value) saveStore(docPathRef.value, s);
}, { deep: true });

export interface SendOpts {
  cli: CliKind;
  sessionId: string | null;
  model: string | null;
  effort: string | null;
  prompt: string;
  preamble: string;
  turnContext: string;
  /** Hash of the current static preamble — recorded on the thread after a
   *  successful Done so the next turn can skip re-sending it. */
  staticPreambleHash?: string;
  accessMap: AccessMap;
  workDir: string;
  /** Absolute paths to attached image files (clipboard paste / file picker). */
  images?: string[];
  onSessionId?: (id: string) => void;
  onToolRequest?: (tool: string, args: unknown, requestId: string) => void;
  onToolDenied?: (tool: string, reason: string) => void;
}

function bindDoc(docPath: string) {
  docPathRef.value = docPath;
  // Unsaved doc (empty path) — keep the in-memory store fresh so the user
  // doesn't see another doc's thread leaking in. Persistence kicks in once
  // the doc is saved and bindDoc is called again with the real path.
  if (!docPath) {
    store.value = emptyStore();
    return;
  }
  store.value = loadStore(docPath);
  // If the loaded store has no active thread but has threads, pick the most recent.
  if (!store.value.activeId && store.value.threads.length > 0) {
    const sorted = [...store.value.threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    store.value.activeId = sorted[0].id;
  }
  // If no threads at all, leave activeId null — startNewThread() lazily creates one on first send.
}

function ensureActiveThread(): AiThread {
  if (activeThread.value) return activeThread.value;
  const t = newThread();
  store.value.threads.push(t);
  store.value.activeId = t.id;
  return t;
}

function pushMessage(msg: AiMessage) {
  const t = ensureActiveThread();
  t.messages.push(msg);
  t.updatedAt = new Date().toISOString();
  if (t.title === 'New chat' && msg.role === 'user') {
    t.title = deriveTitle(t.messages);
  }
}

function getAssistantInActive(idx: number): AiMessage | undefined {
  const t = activeThread.value;
  if (!t) return undefined;
  return t.messages[idx];
}

/** Archive current thread (no-op if empty), start a fresh one. */
function startNewThread() {
  // If there's an empty unused thread, just reuse it.
  const cur = activeThread.value;
  if (cur && cur.messages.length === 0) return;
  const t = newThread();
  store.value.threads.push(t);
  store.value.activeId = t.id;
}

function selectThread(id: string) {
  if (store.value.threads.some(t => t.id === id)) {
    store.value.activeId = id;
  }
}

function deleteThread(id: string) {
  store.value.threads = store.value.threads.filter(t => t.id !== id);
  if (store.value.activeId === id) {
    store.value.activeId = store.value.threads[store.value.threads.length - 1]?.id ?? null;
  }
}

function clearAllThreads() {
  store.value = emptyStore();
}

function pushAttachment(opts: AttachedPin[] | { pins?: AttachedPin[]; images?: AttachedImage[] }) {
  // Backward-compat: accept a bare pin array.
  const pins = Array.isArray(opts) ? opts : (opts.pins ?? []);
  const images = Array.isArray(opts) ? [] : (opts.images ?? []);
  if (!pins.length && !images.length) return;
  pushMessage({
    role: 'attachment',
    text: pins.map(p => p.text).join('\n\n---\n\n'),
    attachments: pins.length ? pins : undefined,
    imageAttachments: images.length ? images : undefined,
    done: true,
  });
}

export function useAi() {
  const aiContext = useAiContext();

  async function send(opts: SendOpts) {
    if (isSending.value) throw new Error('A send is already in flight');
    isSending.value = true;

    // Capture history BEFORE pushing the current user prompt + assistant
    // placeholder, else the live turn would leak into its own history. Local
    // providers (ollama/openai) have no resume, so we replay prior turns;
    // claude/codex resume via session_id and get an empty history.
    const isLocal = opts.cli === 'ollama' || opts.cli === 'openai';
    const history = isLocal ? buildHistory(activeThread.value?.messages ?? []) : [];

    pushMessage({ role: 'user', text: opts.prompt, done: true });
    pushMessage({ role: 'assistant', text: '', done: false });
    const t = ensureActiveThread();
    t.cli = opts.cli;
    t.model = opts.model;
    t.effort = opts.effort;
    const targetThreadId = t.id;
    const assistantIdx = t.messages.length - 1;
    const getAssistant = () => getAssistantInActive(assistantIdx)!;

    const requestId = crypto.randomUUID();
    inFlightRequestId.value = requestId;

    let resolveCompletion!: () => void;
    const completion = new Promise<void>((r) => { resolveCompletion = r; });

    const unlisten = await aiCommands.onStream(requestId, (chunk: AiResponseChunk) => {
      const a = getAssistant();
      if (!a) return;
      switch (chunk.kind) {
        case 'text':
          a.text += chunk.content;
          break;
        case 'tool_request': {
          // Append a permanent tool entry into the chat history.
          const t = activeThread.value;
          if (t) {
            t.messages.push({
              role: 'tool',
              text: typeof chunk.args === 'object' ? JSON.stringify(chunk.args) : String(chunk.args ?? ''),
              tool: chunk.tool,
              done: true,
            });
            t.updatedAt = new Date().toISOString();
          }
          opts.onToolRequest?.(chunk.tool, chunk.args, chunk.requestId);
          break;
        }
        case 'tool_denied':
          opts.onToolDenied?.(chunk.tool, chunk.reason);
          break;
        case 'done': {
          a.done = true;
          aiContext.record(opts.cli, chunk.usage);
          // Resolve by id — the user may have switched threads mid-stream, so
          // the active thread is not necessarily the one this send targeted.
          const tt = store.value.threads.find(th => th.id === targetThreadId);
          if (tt) {
            if (chunk.sessionId) tt.sessionId = chunk.sessionId;
            // Only on success — a failed turn means the model never saw it.
            if (opts.staticPreambleHash) tt.lastSentStaticHash = opts.staticPreambleHash;
          }
          // Local providers (ollama/openai) finish with an empty sessionId —
          // never persist it, so their sends keep resolving to a null session
          // (history replay) and the static preamble is always included.
          if (chunk.sessionId) opts.onSessionId?.(chunk.sessionId);
          resolveCompletion();
          break;
        }
        case 'error':
          a.error = chunk.message;
          a.done = true;
          resolveCompletion();
          break;
      }
    });

    const { settings } = useSettings();
    // For ollama / openai the cliPath channel carries the base URL, not a binary path.
    const overridePath = (opts.cli === 'ollama'
      ? (settings.value.ai.ollamaBaseUrl ?? '')
      : opts.cli === 'openai'
        ? (settings.value.ai.openaiBaseUrl ?? '')
        : opts.cli === 'claude'
          ? settings.value.ai.cliPathClaude
          : settings.value.ai.cliPathCodex
    ).trim();
    const req: AiSendRequest = {
      cli: opts.cli,
      sessionId: opts.sessionId,
      model: opts.model,
      effort: opts.effort,
      prompt: opts.prompt,
      preamble: opts.preamble,
      turnContext: opts.turnContext,
      accessMap: opts.accessMap,
      bypass: bypassEnabled.value,
      workDir: opts.workDir,
      images: opts.images ?? [],
      cliPath: overridePath || null,
      history,
      // Clamped here too (not only in the settings setter): a hand-edited
      // negative value in the settings JSON would fail Rust's Option<u64>
      // deserialization and break every ollama send.
      numCtx: opts.cli === 'ollama' && Number.isFinite(settings.value.ai.ollamaNumCtx)
        ? Math.max(OLLAMA_MIN_NUM_CTX, Math.floor(settings.value.ai.ollamaNumCtx))
        : null,
    };

    try {
      await aiCommands.send(req, requestId);
      await completion;
    } catch (err) {
      console.error('[useAi] send error:', err);
      const a = getAssistant();
      if (a) {
        a.error = (err as Error)?.message ?? String(err);
        a.done = true;
      }
    } finally {
      unlisten();
      inFlightRequestId.value = null;
      isSending.value = false;
    }
    return getAssistant();
  }

  async function cancel() {
    if (inFlightRequestId.value) {
      await aiCommands.cancel(inFlightRequestId.value);
    }
  }

  /**
   * Backwards-compatible no-op kept for callers that used `clearMessages()` to
   * mean "drop the current chat". The new semantic is: archive (do nothing) +
   * start a new thread. Use deleteThread/clearAllThreads for actual removal.
   */
  function clearMessages() {
    startNewThread();
  }

  return {
    messages,
    isSending,
    inFlightRequestId,
    send,
    cancel,
    clearMessages,
    pushAttachment,
    bypassEnabled,
    aiContext,
    bindDoc,
    // Thread management
    threads: computed(() => store.value.threads),
    activeThread,
    activeThreadId: computed(() => store.value.activeId),
    startNewThread,
    selectThread,
    deleteThread,
    clearAllThreads,
  };
}
