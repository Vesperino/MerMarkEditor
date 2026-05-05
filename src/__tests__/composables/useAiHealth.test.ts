import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/aiCommands', () => ({
  aiCommands: {
    healthCheck: vi.fn(),
  },
}));

import { aiCommands } from '../../services/aiCommands';
import { useAiHealth } from '../../composables/useAiHealth';

describe('useAiHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAiHealth().reset();
  });

  it('caches the first result and does not re-call without force', async () => {
    (aiCommands.healthCheck as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue({ ok: true, version: '1', account: 'a', error: null });
    const { check } = useAiHealth();
    await check('claude');
    await check('claude');
    expect(aiCommands.healthCheck).toHaveBeenCalledTimes(1);
  });

  it('force=true bypasses the cache', async () => {
    (aiCommands.healthCheck as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue({ ok: true, version: '1', account: 'a', error: null });
    const { check } = useAiHealth();
    await check('claude');
    await check('claude', true);
    expect(aiCommands.healthCheck).toHaveBeenCalledTimes(2);
  });
});
