import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/aiCommands', () => ({
  aiCommands: {
    cliLatestVersion: vi.fn(),
    cliUpdate: vi.fn(),
  },
}));

import { aiCommands } from '../../services/aiCommands';
import { isOutdated, useAiCliUpdates } from '../../composables/useAiCliUpdates';

const latestMock = aiCommands.cliLatestVersion as unknown as ReturnType<typeof vi.fn>;
const updateMock = aiCommands.cliUpdate as unknown as ReturnType<typeof vi.fn>;

describe('isOutdated', () => {
  it('compares the version each CLI prints with the published one', () => {
    expect(isOutdated('2.1.278 (Claude Code)', '2.1.310')).toBe(true);
    expect(isOutdated('codex-cli 0.144.6', '0.164.0')).toBe(true);
    expect(isOutdated('codex-cli 0.164.0', '0.164.0')).toBe(false);
    expect(isOutdated('2.2.0 (Claude Code)', '2.1.310')).toBe(false);
    expect(isOutdated('codex-cli 0.9.0', '0.10.0')).toBe(true);
  });

  it('never claims an update when a version is unknown', () => {
    expect(isOutdated(null, '2.1.310')).toBe(false);
    expect(isOutdated('2.1.278 (Claude Code)', undefined)).toBe(false);
  });
});

describe('useAiCliUpdates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('looks the newest version up once, and again only after a failure', async () => {
    const { latest, checkLatest } = useAiCliUpdates();
    latestMock.mockRejectedValueOnce(new Error('offline'));
    await checkLatest('codex');
    expect(latest.value.codex).toBeUndefined();

    latestMock.mockResolvedValue('0.164.0');
    await checkLatest('codex');
    await checkLatest('codex');
    expect(latest.value.codex).toBe('0.164.0');
    expect(latestMock).toHaveBeenCalledTimes(2);
  });

  it('runs the CLI update with its path and keeps the error when it fails', async () => {
    const { update, updating, updateError } = useAiCliUpdates();
    updateMock.mockRejectedValueOnce('EBUSY: codex.exe is in use');
    expect(await update('codex', 'C:/npm/codex.cmd')).toBe(false);
    expect(updateMock).toHaveBeenCalledWith('codex', 'C:/npm/codex.cmd');
    expect(updateError.value.codex).toContain('EBUSY');
    expect(updating.value.codex).toBe(false);

    updateMock.mockResolvedValueOnce('Updated to 0.164.0');
    expect(await update('codex', null)).toBe(true);
    expect(updateError.value.codex).toBe('');
  });
});
