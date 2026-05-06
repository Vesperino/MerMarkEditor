import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { aiCommands } from '../../services/aiCommands';

describe('aiCommands', () => {
  beforeEach(() => vi.clearAllMocks());

  it('healthCheck calls ai_health_check with the cli arg', async () => {
    (invoke as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      ok: true, version: '1', account: 'a', error: null,
    });
    const r = await aiCommands.healthCheck('claude');
    expect(invoke).toHaveBeenCalledWith('ai_health_check', { cli: 'claude', overridePath: null });
    expect(r.ok).toBe(true);
  });

  it('healthCheck forwards an explicit override path when provided', async () => {
    (invoke as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      ok: true, version: '1', account: null, error: null,
    });
    await aiCommands.healthCheck('codex', '/opt/homebrew/bin/codex');
    expect(invoke).toHaveBeenCalledWith('ai_health_check', { cli: 'codex', overridePath: '/opt/homebrew/bin/codex' });
  });

  it('send forwards the request payload as `req` and requestId', async () => {
    (invoke as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue('req-123');
    await aiCommands.send({
      cli: 'claude',
      sessionId: null,
      model: null,
      effort: null,
      prompt: 'hi',
      preamble: 'you are',
      accessMap: { readPaths: ['/x'], writePaths: ['/x'], tools: { bash: false, network: false, fileRead: false, fileWrite: false } },
      bypass: false,
      workDir: '/x',
    }, 'req-id');
    expect(invoke).toHaveBeenCalledWith('ai_send', expect.objectContaining({ req: expect.any(Object), requestId: 'req-id' }));
  });
});
