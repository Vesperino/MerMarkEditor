import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @tauri-apps/plugin-fs
const mockWatchCallback = vi.fn();
let capturedWatchHandler: ((event: { type: unknown; paths: string[]; attrs: unknown }) => void) | null = null;
const mockUnwatch = vi.fn();

vi.mock('@tauri-apps/plugin-fs', () => ({
  watch: vi.fn(async (_paths: unknown, cb: (event: { type: unknown }) => void, _options?: unknown) => {
    capturedWatchHandler = cb as typeof capturedWatchHandler;
    mockWatchCallback();
    return mockUnwatch;
  }),
  readTextFile: vi.fn(async (path: string) => {
    return `content of ${path}`;
  }),
}));

import { useFileWatcher } from '../../composables/useFileWatcher';
import { readTextFile } from '@tauri-apps/plugin-fs';

describe('useFileWatcher', () => {
  let onExternalChange: ReturnType<typeof vi.fn>;
  let onFileDeleted: ReturnType<typeof vi.fn>;
  let onWatchError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    capturedWatchHandler = null;

    onExternalChange = vi.fn();
    onFileDeleted = vi.fn();
    onWatchError = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createWatcher = () =>
    useFileWatcher({ onExternalChange, onFileDeleted, onWatchError });

  describe('watchFile', () => {
    it('should set up a watcher for a file path', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'initial content');

      expect(mockWatchCallback).toHaveBeenCalledTimes(1);
    });

    it('should not create duplicate watchers for the same file', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'initial content');
      await watcher.watchFile('/test/file.md', 'initial content');

      expect(mockWatchCallback).toHaveBeenCalledTimes(1);
    });

    it('should store initial content as known disk content', async () => {
      const watcher = createWatcher();
      const initialContent = 'hello world';
      vi.mocked(readTextFile).mockResolvedValueOnce(initialContent);

      await watcher.watchFile('/test/file.md', initialContent);

      // Trigger an event — content is the same as initial, so no callback
      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).not.toHaveBeenCalled();
    });

    it('should call onWatchError if watch setup fails', async () => {
      const { watch: watchFs } = await import('@tauri-apps/plugin-fs');
      vi.mocked(watchFs).mockRejectedValueOnce(new Error('permission denied'));

      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'content');

      expect(onWatchError).toHaveBeenCalledWith('/test/file.md', expect.any(Error));
    });
  });

  describe('event handling', () => {
    it('should call onExternalChange when file content changes', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'old content');

      vi.mocked(readTextFile).mockResolvedValueOnce('new content');

      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).toHaveBeenCalledWith('/test/file.md', 'new content');
    });

    it('should not call onExternalChange when content is unchanged', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'same content');

      vi.mocked(readTextFile).mockResolvedValueOnce('same content');

      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).not.toHaveBeenCalled();
    });

    it('should skip access events', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'content');

      capturedWatchHandler?.({ type: { access: { kind: 'open', mode: 'read' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(readTextFile).not.toHaveBeenCalledWith('/test/file.md');
      expect(onExternalChange).not.toHaveBeenCalled();
    });

    it('should handle modify events', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'old');

      vi.mocked(readTextFile).mockResolvedValueOnce('new');

      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).toHaveBeenCalledWith('/test/file.md', 'new');
    });

    it('should handle create events (file recreated)', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'old');

      vi.mocked(readTextFile).mockResolvedValueOnce('recreated content');

      capturedWatchHandler?.({ type: { create: { kind: 'file' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).toHaveBeenCalledWith('/test/file.md', 'recreated content');
    });

    it('should handle string "any" event type', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'old');

      vi.mocked(readTextFile).mockResolvedValueOnce('changed');

      capturedWatchHandler?.({ type: 'any', paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).toHaveBeenCalledWith('/test/file.md', 'changed');
    });

    it('should handle string "other" event type', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'old');

      vi.mocked(readTextFile).mockResolvedValueOnce('changed');

      capturedWatchHandler?.({ type: 'other', paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).toHaveBeenCalledWith('/test/file.md', 'changed');
    });

    it('should call onFileDeleted when readTextFile throws', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'content');

      vi.mocked(readTextFile).mockRejectedValueOnce(new Error('file not found'));

      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onFileDeleted).toHaveBeenCalledWith('/test/file.md');
    });

    it('should call onWatchError when readTextFile throws and no onFileDeleted handler', async () => {
      const watcher = useFileWatcher({ onExternalChange, onWatchError });
      await watcher.watchFile('/test/file.md', 'content');

      vi.mocked(readTextFile).mockRejectedValueOnce(new Error('disk error'));

      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onWatchError).toHaveBeenCalledWith('/test/file.md', expect.any(Error));
    });
  });

  describe('own-save detection', () => {
    it('should skip events during own save (markSaveStart)', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'content');

      watcher.markSaveStart('/test/file.md');

      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).not.toHaveBeenCalled();
    });

    it('should skip events within grace period after own save (markSaveEnd)', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'content');

      watcher.markSaveStart('/test/file.md');
      watcher.markSaveEnd('/test/file.md', 'saved content');

      // Event within grace period (2000ms)
      vi.advanceTimersByTime(500);

      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).not.toHaveBeenCalled();
    });

    it('should process events after grace period expires', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'old content');

      watcher.markSaveStart('/test/file.md');
      watcher.markSaveEnd('/test/file.md', 'saved content');

      // Advance past grace period (2000ms)
      vi.advanceTimersByTime(2500);

      vi.mocked(readTextFile).mockResolvedValueOnce('externally changed');

      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).toHaveBeenCalledWith('/test/file.md', 'externally changed');
    });

    it('should update known content on markSaveEnd', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'old content');

      watcher.markSaveStart('/test/file.md');
      watcher.markSaveEnd('/test/file.md', 'saved content');

      // After grace period, simulate event where disk content matches saved content
      vi.advanceTimersByTime(2500);
      vi.mocked(readTextFile).mockResolvedValueOnce('saved content');

      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      // Content matches what we saved — should not trigger callback
      expect(onExternalChange).not.toHaveBeenCalled();
    });
  });

  describe('updateKnownContent', () => {
    it('should update known content so matching events are ignored', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'initial');

      // Update known content to new value
      watcher.updateKnownContent('/test/file.md', 'updated');

      // Simulate event where disk content matches updated known content
      vi.mocked(readTextFile).mockResolvedValueOnce('updated');

      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).not.toHaveBeenCalled();
    });

    it('should trigger onExternalChange when content differs from updated known content', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'initial');

      watcher.updateKnownContent('/test/file.md', 'updated');

      vi.mocked(readTextFile).mockResolvedValueOnce('different content');

      capturedWatchHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).toHaveBeenCalledWith('/test/file.md', 'different content');
    });
  });

  describe('unwatchFile', () => {
    it('should call unwatch function and clean up state', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'content');

      watcher.unwatchFile('/test/file.md');

      expect(mockUnwatch).toHaveBeenCalledTimes(1);
    });

    it('should not error when unwatching a file not being watched', () => {
      const watcher = createWatcher();
      expect(() => watcher.unwatchFile('/nonexistent.md')).not.toThrow();
    });

    it('should allow re-watching after unwatch', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file.md', 'content');
      watcher.unwatchFile('/test/file.md');

      mockWatchCallback.mockClear();
      await watcher.watchFile('/test/file.md', 'new content');

      expect(mockWatchCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('unwatchAll', () => {
    it('should unwatch all watched files', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file1.md', 'content1');
      await watcher.watchFile('/test/file2.md', 'content2');

      watcher.unwatchAll();

      expect(mockUnwatch).toHaveBeenCalledTimes(2);
    });

    it('should not error when no files are being watched', () => {
      const watcher = createWatcher();
      expect(() => watcher.unwatchAll()).not.toThrow();
    });
  });

  describe('multiple files', () => {
    it('should track separate content for different files', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file1.md', 'content1');

      // Reset captured handler for second file
      const firstHandler = capturedWatchHandler;

      await watcher.watchFile('/test/file2.md', 'content2');
      const secondHandler = capturedWatchHandler;

      // Trigger event on file1 with changed content
      vi.mocked(readTextFile).mockResolvedValueOnce('new content1');
      firstHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file1.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).toHaveBeenCalledWith('/test/file1.md', 'new content1');

      // Trigger event on file2 with same content — should not trigger
      vi.mocked(readTextFile).mockResolvedValueOnce('content2');
      secondHandler?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file2.md'], attrs: {} });
      await vi.runAllTimersAsync();

      expect(onExternalChange).toHaveBeenCalledTimes(1); // Only file1
    });

    it('should only suppress own-save for the specific file', async () => {
      const watcher = createWatcher();
      await watcher.watchFile('/test/file1.md', 'content1');
      const handler1 = capturedWatchHandler;

      await watcher.watchFile('/test/file2.md', 'content2');
      const handler2 = capturedWatchHandler;

      // Mark file1 as being saved
      watcher.markSaveStart('/test/file1.md');

      // Event on file1 should be suppressed
      handler1?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file1.md'], attrs: {} });
      await vi.runAllTimersAsync();
      expect(onExternalChange).not.toHaveBeenCalled();

      // Event on file2 should NOT be suppressed
      vi.mocked(readTextFile).mockResolvedValueOnce('changed content2');
      handler2?.({ type: { modify: { kind: 'data', mode: 'content' } }, paths: ['/test/file2.md'], attrs: {} });
      await vi.runAllTimersAsync();
      expect(onExternalChange).toHaveBeenCalledWith('/test/file2.md', 'changed content2');
    });
  });
});
