import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useWindowManager } from '../../composables/useWindowManager';

describe('useWindowManager', () => {
  let windowManager: ReturnType<typeof useWindowManager>;

  beforeEach(() => {
    vi.clearAllMocks();
    windowManager = useWindowManager();
  });

  describe('createNewWindow', () => {
    it('should invoke create_new_window with null filePath when not provided', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('window-1');

      const result = await windowManager.createNewWindow();

      expect(invoke).toHaveBeenCalledWith('create_new_window', {
        filePath: null,
      });
      expect(result).toBe('window-1');
    });

    it('should invoke create_new_window with provided filePath', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('window-2');

      const result = await windowManager.createNewWindow('/path/to/file.md');

      expect(invoke).toHaveBeenCalledWith('create_new_window', {
        filePath: '/path/to/file.md',
      });
      expect(result).toBe('window-2');
    });

    it('should handle null filePath explicitly', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('window-3');

      const result = await windowManager.createNewWindow(null);

      expect(invoke).toHaveBeenCalledWith('create_new_window', {
        filePath: null,
      });
      expect(result).toBe('window-3');
    });
  });

  describe('getFilePathFromUrl', () => {
    const originalLocation = window.location;

    beforeEach(() => {
      delete (window as any).location;
    });

    afterEach(() => {
      window.location = originalLocation;
    });

    it('should return null when no file param exists', () => {
      (window as any).location = { search: '' };

      const result = windowManager.getFilePathFromUrl();

      expect(result).toBeNull();
    });

    it('should return decoded file path from URL', () => {
      (window as any).location = { search: '?file=%2Fpath%2Fto%2Ftest.md' };

      const result = windowManager.getFilePathFromUrl();

      expect(result).toBe('/path/to/test.md');
    });

    it('should handle special characters in file path', () => {
      (window as any).location = { search: '?file=%2Fpath%2Fto%2Fmy%20file%20(1).md' };

      const result = windowManager.getFilePathFromUrl();

      expect(result).toBe('/path/to/my file (1).md');
    });
  });

  describe('getAllWindows', () => {
    it('should invoke get_all_windows and return window labels', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(['main', 'window-1', 'window-2']);

      const result = await windowManager.getAllWindows();

      expect(invoke).toHaveBeenCalledWith('get_all_windows');
      expect(result).toEqual(['main', 'window-1', 'window-2']);
    });

    it('should return empty array when no windows', async () => {
      vi.mocked(invoke).mockResolvedValueOnce([]);

      const result = await windowManager.getAllWindows();

      expect(result).toEqual([]);
    });
  });

  describe('getCurrentWindowLabel', () => {
    it('should invoke get_current_window_label and return label', async () => {
      vi.mocked(invoke).mockResolvedValueOnce('main');

      const result = await windowManager.getCurrentWindowLabel();

      expect(invoke).toHaveBeenCalledWith('get_current_window_label');
      expect(result).toBe('main');
    });
  });

  describe('transferTabToWindow', () => {
    it('should invoke transfer_tab_to_window with correct params', async () => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined);

      await windowManager.transferTabToWindow(
        '/path/to/file.md',
        'main',
        'window-1'
      );

      expect(invoke).toHaveBeenCalledWith('transfer_tab_to_window', {
        filePath: '/path/to/file.md',
        sourceWindow: 'main',
        targetWindow: 'window-1',
      });
    });
  });

  describe('onTabTransfer', () => {
    it('should register listener for tab-transfer event', async () => {
      const mockUnlisten = vi.fn();
      vi.mocked(listen).mockResolvedValueOnce(mockUnlisten);
      const callback = vi.fn();

      const unlisten = await windowManager.onTabTransfer(callback);

      expect(listen).toHaveBeenCalledWith('tab-transfer', expect.any(Function));
      expect(unlisten).toBe(mockUnlisten);
    });

    it('should call callback with payload when event received', async () => {
      const mockUnlisten = vi.fn();
      let eventHandler: (event: any) => void;

      vi.mocked(listen).mockImplementationOnce(async (_eventName, handler) => {
        eventHandler = handler as (event: any) => void;
        return mockUnlisten;
      });

      const callback = vi.fn();
      await windowManager.onTabTransfer(callback);

      eventHandler!({
        payload: {
          file_path: '/path/to/file.md',
          source_window: 'main',
          target_window: 'window-1',
        },
      });

      expect(callback).toHaveBeenCalledWith({
        file_path: '/path/to/file.md',
        source_window: 'main',
        target_window: 'window-1',
      });
    });
  });

  describe('closeCurrentWindow', () => {
    it('should get current window and close it', async () => {
      const mockClose = vi.fn().mockResolvedValue(undefined);
      vi.mocked(getCurrentWindow).mockReturnValue({ close: mockClose } as any);

      await windowManager.closeCurrentWindow();

      expect(getCurrentWindow).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
