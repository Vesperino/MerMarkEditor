import { ref } from 'vue';
import { aiCommands, type AiSendRequest, type AiResponseChunk, type CliKind, type AccessMap } from '../services/aiCommands';
import { useAiContext } from './useAiContext';

export interface AiMessage {
  role: 'user' | 'assistant';
  text: string;
  error?: string;
  done: boolean;
}

const bypassEnabled = ref(false); // runtime-only — not persisted

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

export function useAi() {
  const messages = ref<AiMessage[]>([]);
  const inFlightRequestId = ref<string | null>(null);
  const isSending = ref(false);
  const aiContext = useAiContext();

  async function send(opts: SendOpts) {
    if (isSending.value) throw new Error('A send is already in flight');
    isSending.value = true;
    console.log('[useAi] send start', { cli: opts.cli, model: opts.model, effort: opts.effort });
    messages.value.push({ role: 'user', text: opts.prompt, done: true });
    messages.value.push({ role: 'assistant', text: '', done: false });
    // CRITICAL: mutate via array index so Vue's reactive proxy sees the change.
    // The local `assistant` reference would point to the raw object, not the
    // proxy Vue created when the array was made reactive — direct mutations on
    // it would not trigger reactivity and the UI would stay empty.
    const assistantIdx = messages.value.length - 1;
    const getAssistant = () => messages.value[assistantIdx];

    // Generate request_id locally so we can subscribe BEFORE the backend
    // starts emitting (fixes listener race for fast CLI responses).
    const requestId = crypto.randomUUID();
    inFlightRequestId.value = requestId;
    console.log('[useAi] requestId generated:', requestId);

    let resolveCompletion!: () => void;
    const completion = new Promise<void>((r) => { resolveCompletion = r; });

    // Subscribe FIRST.
    const unlisten = await aiCommands.onStream(requestId, (chunk: AiResponseChunk) => {
      console.log('[useAi] chunk:', chunk);
      const a = getAssistant();
      switch (chunk.kind) {
        case 'text':
          a.text += chunk.content;
          break;
        case 'tool_request':
          opts.onToolRequest?.(chunk.tool, chunk.args, chunk.requestId);
          break;
        case 'tool_denied':
          opts.onToolDenied?.(chunk.tool, chunk.reason);
          break;
        case 'done':
          a.done = true;
          aiContext.record(opts.cli, chunk.usage);
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
      // Now spawn — listener is already attached.
      const returnedId = await aiCommands.send(req, requestId);
      console.log('[useAi] backend ack returned id:', returnedId);
      await completion;
      console.log('[useAi] completion resolved, assistant.text length:', getAssistant().text.length);
    } catch (err) {
      console.error('[useAi] send error:', err);
      const a = getAssistant();
      a.error = (err as Error)?.message ?? String(err);
      a.done = true;
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

  function clearMessages() { messages.value = []; }

  return { messages, isSending, inFlightRequestId, send, cancel, clearMessages, bypassEnabled, aiContext };
}
