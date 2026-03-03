import { ref, computed, nextTick, type Ref, type ComputedRef } from 'vue';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { markdownToHtml } from '../utils/markdown-converter';
import { generateDiff, type DiffLine, type DiffStats } from './useDiffPreview';
import { useFileWatcher } from './useFileWatcher';
import { t } from '../i18n';
import type { Tab } from './useTabs';

interface PaneTabResult {
  pane: { id: string; activeTabId: string; tabs: Tab[] };
  tab: Tab;
}

export interface UseFileReloadOptions {
  activePaneId: Ref<string>;
  currentFile: ComputedRef<string | null>;
  hasChanges: ComputedRef<boolean>;
  findTabByFilePathSplit: (filePath: string) => PaneTabResult | undefined;
  setEditorContent: (content: string) => void;
}

export function useFileReload(options: UseFileReloadOptions) {
  const { activePaneId, currentFile, hasChanges, findTabByFilePathSplit, setEditorContent } = options;

  // Toast state
  const showToast = ref(false);
  const toastMessage = ref('');
  const toastType = ref<'info' | 'success' | 'warning'>('info');

  // Conflict modal state
  const showConflictModal = ref(false);
  const conflictFileName = ref('');
  const conflictDiffLines = ref<DiffLine[]>([]);
  const conflictDiffStats = ref<DiffStats>({ additions: 0, deletions: 0 });
  const conflictFilePath = ref('');
  const conflictNewContent = ref('');

  const showToastNotification = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    toastMessage.value = message;
    toastType.value = type;
    showToast.value = true;
  };

  const dismissToast = () => {
    showToast.value = false;
  };

  // File watcher — callbacks are arrow functions so handlers are resolved at call time
  const fileWatcher = useFileWatcher({
    onExternalChange: (filePath: string, newDiskContent: string) => {
      handleExternalFileChange(filePath, newDiskContent);
    },
    onFileDeleted: (filePath: string) => {
      const result = findTabByFilePathSplit(filePath);
      if (!result) return;
      showToastNotification(t.value.fileDeletedExternally(result.tab.fileName), 'warning');
    },
    onWatchError: (filePath, error) => {
      console.error(`[FileWatcher] Error watching ${filePath}:`, error);
    },
  });

  const reloadTabContent = (filePath: string, newContent: string) => {
    const result = findTabByFilePathSplit(filePath);
    if (!result) return;

    const { pane, tab } = result;
    const htmlContent = markdownToHtml(newContent);
    const savedScrollTop = tab.scrollTop;

    tab.content = htmlContent;
    tab.originalMarkdown = newContent;
    tab.hasChanges = false;

    fileWatcher.updateKnownContent(filePath, newContent);

    if (tab.id === pane.activeTabId && pane.id === activePaneId.value) {
      setEditorContent(htmlContent);
      nextTick(() => {
        const editorContainer = document.querySelector('.editor-pane.active .editor-container');
        if (editorContainer) {
          editorContainer.scrollTop = savedScrollTop;
        }
      });
    }
  };

  const handleExternalFileChange = (filePath: string, newDiskContent: string) => {
    const result = findTabByFilePathSplit(filePath);
    if (!result) return;

    const { tab } = result;

    if (!tab.hasChanges) {
      reloadTabContent(filePath, newDiskContent);
      showToastNotification(t.value.fileReloadedExternally(tab.fileName), 'info');
    } else {
      const diffResult = generateDiff(tab.originalMarkdown || '', newDiskContent);
      conflictFilePath.value = filePath;
      conflictFileName.value = tab.fileName;
      conflictDiffLines.value = diffResult.lines;
      conflictDiffStats.value = diffResult.stats;
      conflictNewContent.value = newDiskContent;
      showConflictModal.value = true;
    }
  };

  const handleConflictKeepLocal = () => {
    fileWatcher.updateKnownContent(conflictFilePath.value, conflictNewContent.value);
    showConflictModal.value = false;
  };

  const handleConflictLoadExternal = () => {
    reloadTabContent(conflictFilePath.value, conflictNewContent.value);
    showConflictModal.value = false;
  };

  const manualReload = async () => {
    const filePath = currentFile.value;
    if (!filePath) return;

    try {
      const newContent = await readTextFile(filePath);

      if (hasChanges.value) {
        handleExternalFileChange(filePath, newContent);
      } else {
        reloadTabContent(filePath, newContent);
        showToastNotification(t.value.fileReloaded, 'success');
      }
    } catch (error) {
      console.error('Error reloading file:', error);
      showToastNotification(t.value.fileReloadError, 'warning');
    }
  };

  return {
    // Toast
    showToast: computed(() => showToast.value),
    toastMessage: computed(() => toastMessage.value),
    toastType: computed(() => toastType.value),
    dismissToast,

    // Conflict modal
    showConflictModal: computed(() => showConflictModal.value),
    conflictFileName: computed(() => conflictFileName.value),
    conflictDiffLines: computed(() => conflictDiffLines.value),
    conflictDiffStats: computed(() => conflictDiffStats.value),
    handleConflictKeepLocal,
    handleConflictLoadExternal,

    // Manual reload
    manualReload,

    // File watcher controls (exposed for App.vue integration)
    watchFile: fileWatcher.watchFile,
    unwatchFile: fileWatcher.unwatchFile,
    unwatchAll: fileWatcher.unwatchAll,
    markSaveStart: fileWatcher.markSaveStart,
    markSaveEnd: fileWatcher.markSaveEnd,
  };
}
