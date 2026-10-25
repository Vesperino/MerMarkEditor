import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { invoke } from '@tauri-apps/api/core';
import { isFlatpak } from '../../services/flatpak';

describe('isFlatpak', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns what the backend reports', async () => {
    vi.mocked(invoke).mockResolvedValue(true);
    expect(await isFlatpak()).toBe(true);
    expect(invoke).toHaveBeenCalledWith('is_flatpak');
  });

  it('treats a failing backend call as a regular install', async () => {
    vi.mocked(invoke).mockRejectedValue(new Error('command is_flatpak not found'));
    expect(await isFlatpak()).toBe(false);
  });
});
