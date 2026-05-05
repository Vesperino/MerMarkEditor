import { ref, computed, watch } from 'vue';
import { aiCommands, type AiSendRequest, type AiResponseChunk, type CliKind, type AccessMap } from '../services/aiCommands';
import { useAiContext } from './useAiContext';

export interface AttachedPin {
  id: string;
  text: string;
}

export interface AiMessage {
  role: 'user' | 'assistant' | 'tool' | 'attachment';
  text: string;
  /** When role === 'tool', this carries the tool name. */
  tool?: string;
  /** When role === 'attachment', the pins sent with the next user prompt. */
  attachments?: AttachedPin[];
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
    const trimmed: ThreadStore = {
      version: 1,
      activeId: store.activeId,
      threads: store.threads
        .slice(-MAX_THREADS_PER_DOC)
        .map(t => ({ ...t, messages: t.messages.slice(-MAX_MESSAGES_PER_THREAD) })),
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

function newThread(): AiThread {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    sessionId: null,
    cli: null,
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
  accessMap: AccessMap;
  workDir: string;
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

function pushAttachment(pins: AttachedPin[]) {
  if (!pins.length) return;
  pushMessage({
    role: 'attachment',
    text: pins.map(p => p.text).join('\n\n---\n\n'),
    attachments: pins,
    done: true,
  });
}

export function useAi() {
  const aiContext = useAiContext();

  async function send(opts: SendOpts) {
    if (isSending.value) throw new Error('A send is already in flight');
    isSending.value = true;
    console.log('[useAi] send start', { cli: opts.cli, model: opts.model, effort: opts.effort });

    pushMessage({ role: 'user', text: opts.prompt, done: true });
    pushMessage({ role: 'assistant', text: '', done: false });
    const t = ensureActiveThread();
    t.cli = opts.cli;
    const assistantIdx = t.messages.length - 1;
    const getAssistant = () => getAssistantInActive(assistantIdx)!;

    const requestId = crypto.randomUUID();
    inFlightRequestId.value = requestId;
    console.log('[useAi] requestId generated:', requestId);

    let resolveCompletion!: () => void;
    const completion = new Promise<void>((r) => { resolveCompletion = r; });

    const unlisten = await aiCommands.onStream(requestId, (chunk: AiResponseChunk) => {
      console.log('[useAi] chunk:', chunk);
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
        case 'done':
          a.done = true;
          aiContext.record(opts.cli, chunk.usage);
          if (chunk.sessionId) {
            const tt = activeThread.value;
            if (tt) tt.sessionId = chunk.sessionId;
          }
          opts.onSessionId?.(chunk.sessionId);
          resolveCompletion();
          break;
        case 'error':
          a.error = chunk.message;
          a.done = true;
          resolveCompletion();
          break;
      }
    });
    console.log('[useAi] listener registered for', requestId);

    const req: AiSendRequest = {
      cli: opts.cli,
      sessionId: opts.sessionId,
      model: opts.model,
      effort: opts.effort,
      prompt: opts.prompt,
      preamble: opts.preamble,
      accessMap: opts.accessMap,
      bypass: bypassEnabled.value,
      workDir: opts.workDir,
    };

    try {
      const returnedId = await aiCommands.send(req, requestId);
      console.log('[useAi] backend ack returned id:', returnedId);
      await completion;
      console.log('[useAi] completion resolved, assistant.text length:', getAssistant()?.text.length ?? 0);
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
