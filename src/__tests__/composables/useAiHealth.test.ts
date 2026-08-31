import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/aiCommands', () => ({
  aiCommands: {
    healthCheck: vi.fn(),
  },
}));

import { aiCommands } from '../../services/aiCommands';
import { readPersistedCliHealth, useAiHealth } from '../../composables/useAiHealth';
import { useSettings } from '../../composables/useSettings';

describe('useAiHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAiHealth().reset(true);
    useSettings().setAiCheckCliHealthOnStartup(true);
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

  it('reset initializes an ollama cache slot', () => {
    const { cache } = useAiHealth();
    expect('ollama' in cache.value).toBe(true);
    expect(cache.value.ollama).toBeNull();
  });

  it('checkAll probes ollama too', async () => {
    (aiCommands.healthCheck as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue({ ok: true, version: '2 models', account: null, error: null });
    const { checkAll } = useAiHealth();
    await checkAll();
    expect(aiCommands.healthCheck).toHaveBeenCalledWith('ollama', expect.anything());
  });

  it('checks Claude and Codex automatically by default', async () => {
    (aiCommands.healthCheck as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue({ ok: true, version: '1', account: null, error: null, resolvedPath: null });

    await useAiHealth().checkCliOnStartup();

    expect(aiCommands.healthCheck).toHaveBeenCalledWith('claude', null);
    expect(aiCommands.healthCheck).toHaveBeenCalledWith('codex', null);
  });

  it('skips Claude and Codex startup probes when the preference is disabled', async () => {
    useSettings().setAiCheckCliHealthOnStartup(false);
    (aiCommands.healthCheck as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue({ ok: true, version: '1', account: null, error: null, resolvedPath: null });

    await useAiHealth().checkCliOnStartup();

    expect(aiCommands.healthCheck).not.toHaveBeenCalled();
  });

  it('persists the last-known CLI status locally', async () => {
    (aiCommands.healthCheck as unknown as { mockResolvedValue: (v: unknown) => void })
      .mockResolvedValue({ ok: true, version: '1.2.3', account: 'me', error: null, resolvedPath: '/bin/claude' });

    await useAiHealth().check('claude', true);

    const stored = JSON.parse(localStorage.getItem('mermark-ai-cli-health') ?? '{}');
    expect(stored.claude.status).toMatchObject({ ok: true, version: '1.2.3', account: 'me' });
    expect(typeof stored.claude.checkedAt).toBe('number');
  });

  it('restores valid cached status and ignores malformed entries', () => {
    localStorage.setItem('mermark-ai-cli-health', JSON.stringify({
      claude: {
        status: { ok: true, version: '1.2.3', account: 'me', error: null, resolvedPath: '/bin/claude' },
        checkedAt: 123,
      },
      codex: { status: { ok: 'yes' }, checkedAt: 'yesterday' },
    }));

    const restored = readPersistedCliHealth();
    expect(restored.claude?.status.ok).toBe(true);
    expect(restored.claude?.checkedAt).toBe(123);
    expect(restored.codex).toBeUndefined();
  });
});
