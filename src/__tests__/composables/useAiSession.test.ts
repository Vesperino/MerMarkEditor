import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/aiCommands', () => ({
  aiCommands: {
    sessionGet: vi.fn(),
    sessionUpsert: vi.fn(),
    sessionRemove: vi.fn(),
    sessionMigrate: vi.fn(),
    sessionRecoverByHash: vi.fn(),
  },
}));

import { aiCommands } from '../../services/aiCommands';
import { useAiSession } from '../../composables/useAiSession';

beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      subtle: {
        digest: async (_alg: string, data: BufferSource) => {
          const arr = new Uint8Array((data as ArrayBuffer).byteLength);
          arr.set(new Uint8Array(data as ArrayBuffer));
          const out = new Uint8Array(20);
          for (let i = 0; i < arr.length && i < 20; i++) out[i] = arr[i];
          return out.buffer;
        },
      },
    },
    configurable: true,
  });
  vi.clearAllMocks();
});

describe('useAiSession', () => {
  it('persistFromResponse upserts a mapping with iso timestamp and hex hash', async () => {
    (aiCommands.sessionUpsert as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue(undefined);
    const { persistFromResponse, current } = useAiSession();
    await persistFromResponse({ docPath: '/x', cli: 'claude', sessionId: 's1', docContent: 'hello' });
    expect(current.value?.sessionId).toBe('s1');
    expect(current.value?.contentHash).toMatch(/^[0-9a-f]+$/);
    expect(current.value?.lastUsed).toMatch(/T/);
  });

  it('startNew clears current', async () => {
    const { startNew, current } = useAiSession();
    await startNew();
    expect(current.value).toBeNull();
  });
});
