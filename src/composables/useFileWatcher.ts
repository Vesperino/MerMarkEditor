import { watch as watchFs, readTextFile, type UnwatchFn } from '@tauri-apps/plugin-fs';
import { TIMING } from '../constants';

export interface UseFileWatcherOptions {
  onExternalChange: (filePath: string, newDiskContent: string) => void;
  onFileDeleted?: (filePath: string) => void;
  onWatchError?: (filePath: string, error: unknown) => void;
}

export interface UseFileWatcherReturn {
  watchFile: (filePath: string, initialContent: string) => Promise<void>;
  unwatchFile: (filePath: string) => void;
  unwatchAll: () => void;
  markSaveStart: (filePath: string) => void;
  markSaveEnd: (filePath: string, newContent: string) => void;
  updateKnownContent: (filePath: string, content: string) => void;
}

export function useFileWatcher(options: UseFileWatcherOptions): UseFileWatcherReturn {
  const { onExternalChange, onFileDeleted, onWatchError } = options;

  // Active watcher cleanup functions
  const watchers = new Map<string, UnwatchFn>();
  // Files currently being saved by us
  const ownSavesInProgress = new Set<string>();
  // Timestamps of recently completed own saves (for grace period)
  const recentOwnSaves = new Map<string, number>();
  // Last known disk content per file (to detect actual content changes)
  const lastKnownDiskContent = new Map<string, string>();

  const isOwnSave = (filePath: string): boolean => {
    if (ownSavesInProgress.has(filePath)) return true;

    const saveTimestamp = recentOwnSaves.get(filePath);
    if (saveTimestamp && Date.now() - saveTimestamp < TIMING.OWN_SAVE_GRACE_PERIOD) return true;

    return false;
  };

  const handleWatchEvent = async (filePath: string) => {
    if (isOwnSave(filePath)) return;

    try {
      const newContent = await readTextFile(filePath);
      const knownContent = lastKnownDiskContent.get(filePath);

      // Content unchanged — spurious event
      if (knownContent !== undefined && newContent === knownContent) return;

      lastKnownDiskContent.set(filePath, newContent);
      onExternalChange(filePath, newContent);
    } catch (error) {
      // File might have been deleted
      if (onFileDeleted) {
        onFileDeleted(filePath);
      } else {
        onWatchError?.(filePath, error);
      }
    }
  };

  const watchFile = async (filePath: string, initialContent: string): Promise<void> => {
    // Already watching this file
    if (watchers.has(filePath)) return;

    lastKnownDiskContent.set(filePath, initialContent);

    try {
      const unwatch = await watchFs(filePath, (event) => {
        console.debug('[FileWatcher] Event received:', filePath, JSON.stringify(event.type));

        // Skip access-only events (file reads, not writes)
        const t = event.type;
        if (t && typeof t === 'object' && 'access' in t) return;

        // For all other events (modify, create, any, other, etc.)
        // delegate to handleWatchEvent which reads and compares content.
        // This is safe because content comparison filters spurious events.
        handleWatchEvent(filePath);
      }, { delayMs: TIMING.FILE_WATCH_DEBOUNCE });

      watchers.set(filePath, unwatch);
      console.debug('[FileWatcher] Now watching:', filePath);
    } catch (error) {
      console.error('[FileWatcher] Failed to watch:', filePath, error);
      onWatchError?.(filePath, error);
    }
  };

  const unwatchFile = (filePath: string): void => {
    const unwatch = watchers.get(filePath);
    if (unwatch) {
      unwatch();
      watchers.delete(filePath);
    }
    lastKnownDiskContent.delete(filePath);
    recentOwnSaves.delete(filePath);
    ownSavesInProgress.delete(filePath);
  };

  const unwatchAll = (): void => {
    for (const [, unwatch] of watchers) {
      unwatch();
    }
    watchers.clear();
    lastKnownDiskContent.clear();
    recentOwnSaves.clear();
    ownSavesInProgress.clear();
  };

  const markSaveStart = (filePath: string): void => {
    ownSavesInProgress.add(filePath);
  };

  const markSaveEnd = (filePath: string, newContent: string): void => {
    ownSavesInProgress.delete(filePath);
    recentOwnSaves.set(filePath, Date.now());
    lastKnownDiskContent.set(filePath, newContent);
  };

  const updateKnownContent = (filePath: string, content: string): void => {
    lastKnownDiskContent.set(filePath, content);
  };

  return {
    watchFile,
    unwatchFile,
    unwatchAll,
    markSaveStart,
    markSaveEnd,
    updateKnownContent,
  };
}
