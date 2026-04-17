import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAutoUpdate } from '../../composables/useAutoUpdate';

const DISMISSED_KEY = 'mermark-dismissed-update-version';

// Hoisted mock state for @tauri-apps/plugin-updater
const mockCheckResult = vi.hoisted(() => ({ value: null as { version: string; body: string } | null }));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(async () => mockCheckResult.value),
}));

describe('useAutoUpdate', () => {
  beforeEach(() => {
    localStorage.clear();
    mockCheckResult.value = null;
    // Prevent real network calls via fetch
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does nothing when no update is available', async () => {
    mockCheckResult.value = null;
    const { checkForUpdates, showUpdateDialog, updateInfo } = useAutoUpdate();

    await checkForUpdates();
    expect(showUpdateDialog.value).toBe(false);
    expect(updateInfo.value).toBeNull();
  });

  it('shows dialog when an update is available', async () => {
    mockCheckResult.value = { version: '0.1.72', body: 'Release notes here' };
    const { checkForUpdates, showUpdateDialog, updateInfo } = useAutoUpdate();

    await checkForUpdates();
    expect(showUpdateDialog.value).toBe(true);
    expect(updateInfo.value).toEqual({ version: '0.1.72', notes: 'Release notes here' });
  });

  it('skips dialog when version was previously dismissed', async () => {
    localStorage.setItem(DISMISSED_KEY, '0.1.72');
    mockCheckResult.value = { version: '0.1.72', body: 'notes' };
    const { checkForUpdates, showUpdateDialog } = useAutoUpdate();

    await checkForUpdates();
    expect(showUpdateDialog.value).toBe(false);
  });

  it('still shows dialog for a NEW version even if older was dismissed', async () => {
    localStorage.setItem(DISMISSED_KEY, '0.1.71');
    mockCheckResult.value = { version: '0.1.72', body: 'new notes' };
    const { checkForUpdates, showUpdateDialog } = useAutoUpdate();

    await checkForUpdates();
    expect(showUpdateDialog.value).toBe(true);
  });

  it('persists dismissed version when closeUpdateDialog is called', async () => {
    mockCheckResult.value = { version: '0.1.72', body: 'notes' };
    const { checkForUpdates, closeUpdateDialog, showUpdateDialog } = useAutoUpdate();

    await checkForUpdates();
    closeUpdateDialog();

    expect(showUpdateDialog.value).toBe(false);
    expect(localStorage.getItem(DISMISSED_KEY)).toBe('0.1.72');
  });

  it('does not dismiss while update is in progress', async () => {
    mockCheckResult.value = { version: '0.1.72', body: 'notes' };
    const { checkForUpdates, closeUpdateDialog, isUpdating, showUpdateDialog } = useAutoUpdate();

    await checkForUpdates();
    isUpdating.value = true;
    closeUpdateDialog();

    // Still open, nothing persisted
    expect(showUpdateDialog.value).toBe(true);
    expect(localStorage.getItem(DISMISSED_KEY)).toBeNull();
  });

  it('falls back to GitHub API when Tauri body is empty', async () => {
    mockCheckResult.value = { version: '0.1.72', body: '' };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ body: 'From GitHub API' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { checkForUpdates, updateInfo } = useAutoUpdate();
    await checkForUpdates();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('api.github.com/repos/Vesperino/MerMarkEditor/releases/tags/v0.1.72'),
    );
    expect(updateInfo.value?.notes).toBe('From GitHub API');
  });

  it('does not call GitHub API when Tauri body is non-empty', async () => {
    mockCheckResult.value = { version: '0.1.72', body: 'Tauri provided' };
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { checkForUpdates, updateInfo } = useAutoUpdate();
    await checkForUpdates();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(updateInfo.value?.notes).toBe('Tauri provided');
  });

  it('handles GitHub API failure silently (empty notes)', async () => {
    mockCheckResult.value = { version: '0.1.72', body: '' };
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));

    const { checkForUpdates, updateInfo } = useAutoUpdate();
    await checkForUpdates();

    expect(updateInfo.value?.notes).toBe('');
  });
});
