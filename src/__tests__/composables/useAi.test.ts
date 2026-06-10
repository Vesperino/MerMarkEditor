import { describe, it, expect, vi, beforeEach } from 'vitest';

let lastHandler: ((chunk: unknown) => void) | null = null;

vi.mock('../../services/aiCommands', () => ({
  aiCommands: {
    send: vi.fn(),
    cancel: vi.fn(),
    onStream: vi.fn((_id: string, h: (c: unknown) => void) => {
      lastHandler = h;
      return Promise.resolve(() => {});
    }),
  },
}));

import { aiCommands } from '../../services/aiCommands';
import { useAi } from '../../composables/useAi';
import { useSettings, OLLAMA_DEFAULT_NUM_CTX, OLLAMA_MIN_NUM_CTX } from '../../composables/useSettings';

describe('useAi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastHandler = null;
    // Reset module-scope thread store between tests.
    const { clearAllThreads } = useAi();
    clearAllThreads();
    if (!('randomUUID' in crypto)) {
      Object.defineProperty(crypto, 'randomUUID', {
        value: () => 'test-uuid',
        configurable: true,
      });
    }
  });

  it('appends user + assistant messages and accumulates streamed text', async () => {
    (aiCommands.send as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('req-1');

    const { send, messages } = useAi();
    const promise = send({
      cli: 'claude', sessionId: null, model: null, effort: null, prompt: 'hi', preamble: 'p', turnContext: '',
      accessMap: { readPaths: [], writePaths: [], tools: { bash: false, network: false, fileRead: false, fileWrite: false } },
      workDir: '/x',
    });

    // Wait for onStream to be set up.
    await new Promise(r => setTimeout(r, 30));
    if (!lastHandler) throw new Error('onStream handler not registered');
    lastHandler({ kind: 'text', content: 'Hel' });
    lastHandler({ kind: 'text', content: 'lo' });
    lastHandler({ kind: 'done', sessionId: 's1', usage: null });
    await promise;

    expect(messages.value[0].role).toBe('user');
    expect(messages.value[1].role).toBe('assistant');
    expect(messages.value[1].text).toBe('Hello');
    expect(messages.value[1].done).toBe(true);
    expect(aiCommands.send).toHaveBeenCalledWith(expect.any(Object), expect.any(String));
  });

  it('records staticPreambleHash on the thread after a successful done', async () => {
    (aiCommands.send as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('req-2');

    const { send, activeThread } = useAi();
    const promise = send({
      cli: 'claude', sessionId: null, model: null, effort: null, prompt: 'hi', preamble: 'p', turnContext: '',
      staticPreambleHash: 'hash-1',
      accessMap: { readPaths: [], writePaths: [], tools: { bash: false, network: false, fileRead: false, fileWrite: false } },
      workDir: '/x',
    });

    await new Promise(r => setTimeout(r, 30));
    if (!lastHandler) throw new Error('onStream handler not registered');
    expect(activeThread.value?.lastSentStaticHash).toBeNull();
    lastHandler({ kind: 'done', sessionId: 's1', usage: null });
    await promise;

    expect(activeThread.value?.lastSentStaticHash).toBe('hash-1');
  });

  it('does not record staticPreambleHash when the turn errors', async () => {
    (aiCommands.send as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('req-3');

    const { send, activeThread } = useAi();
    const promise = send({
      cli: 'claude', sessionId: null, model: null, effort: null, prompt: 'hi', preamble: 'p', turnContext: '',
      staticPreambleHash: 'hash-2',
      accessMap: { readPaths: [], writePaths: [], tools: { bash: false, network: false, fileRead: false, fileWrite: false } },
      workDir: '/x',
    });

    await new Promise(r => setTimeout(r, 30));
    if (!lastHandler) throw new Error('onStream handler not registered');
    lastHandler({ kind: 'error', message: 'boom', exitCode: 1 });
    await promise;

    expect(activeThread.value?.lastSentStaticHash).toBeNull();
  });

  async function runTurn(
    cli: 'claude' | 'ollama' | 'openai',
    prompt: string,
    reply: string,
  ) {
    const { send } = useAi();
    const promise = send({
      cli, sessionId: null, model: null, effort: null, prompt, preamble: 'p', turnContext: '',
      accessMap: { readPaths: [], writePaths: [], tools: { bash: false, network: false, fileRead: false, fileWrite: false } },
      workDir: '/x',
    });
    await new Promise(r => setTimeout(r, 30));
    if (!lastHandler) throw new Error('onStream handler not registered');
    lastHandler({ kind: 'text', content: reply });
    lastHandler({ kind: 'done', sessionId: 's1', usage: null });
    await promise;
  }

  it('sends prior user+assistant turns as history for a local provider', async () => {
    (aiCommands.send as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('req');

    await runTurn('ollama', 'first question', 'first answer');
    await runTurn('ollama', 'second question', 'second answer');

    const secondCall = (aiCommands.send as unknown as { mock: { calls: unknown[][] } }).mock.calls[1];
    const req = secondCall[0] as { history?: { role: string; content: string }[] };
    expect(req.history).toEqual([
      { role: 'user', content: 'first question' },
      { role: 'assistant', content: 'first answer' },
    ]);
  });

  it('clamps a hand-edited negative ollamaNumCtx before sending', async () => {
    (aiCommands.send as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('req');
    const { settings } = useSettings();
    // Simulate a hand-edited settings JSON that bypassed the setter clamp — a
    // negative value fails Rust's Option<u64> deserialization on every send.
    settings.value.ai.ollamaNumCtx = -2048;

    await runTurn('ollama', 'question', 'answer');

    const call = (aiCommands.send as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
    const req = call[0] as { numCtx?: number | null };
    expect(req.numCtx).toBe(OLLAMA_MIN_NUM_CTX);
    settings.value.ai.ollamaNumCtx = OLLAMA_DEFAULT_NUM_CTX;
  });

  it('sends an empty history for claude (resumes via session id)', async () => {
    (aiCommands.send as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('req');

    await runTurn('claude', 'first question', 'first answer');
    await runTurn('claude', 'second question', 'second answer');

    const secondCall = (aiCommands.send as unknown as { mock: { calls: unknown[][] } }).mock.calls[1];
    const req = secondCall[0] as { history?: { role: string; content: string }[] };
    expect(req.history).toEqual([]);
  });
});
