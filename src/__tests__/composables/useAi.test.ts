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
      cli: 'claude', sessionId: null, model: null, effort: null, prompt: 'hi', preamble: 'p',
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
});
