import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile, rename, remove } from '@tauri-apps/plugin-fs';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { htmlToMarkdown, markdownToHtml, detectLineEnding, applyLineEnding } from '../utils/markdown-converter';
import type { Tab } from './useTabs';
import { EMPTY_TAB_CONTENT, DEFAULT_FILE_NAME, DOM_SELECTORS, TIMING } from '../constants';

export interface UseFileOperationsOptions {
  tabs: Ref<Tab[]>;
  activeTabId: Ref<string>;
  activeTab: ComputedRef<Tab>;
  findTabByFilePath: (filePath: string) => Tab | undefined;
  createNewTab: (filePath?: string | null, fileContent?: string, fileName?: string) => string;
  switchToTab: (tabId: string, preserveHasChanges?: boolean) => Promise<void>;
  getEditorHtml: () => string;
  /** Optional override — when provided, used directly as markdown instead of converting from HTML.
   *  Use this to pass raw codeContent when saving from code view. */
  getMarkdownOverride?: () => string | null;
  setEditorContent: (content: string) => void;
  markSaveStart?: (filePath: string) => void;
  markSaveEnd?: (filePath: string, content: string) => void;
  onFileOpened?: (filePath: string, content: string) => void;
  /** Returns 'save' | 'cancel' | mergedMarkdownString (to save the merged version).
   *  localMarkdown is the current editor content (used to compute a local→disk diff). */
  onPreSaveConflict?: (filePath: string, diskContent: string, localMarkdown: string) => Promise<'save' | 'cancel' | string>;
}

export interface UseFileOperationsReturn {
  currentFile: ComputedRef<string | null>;
  isLoadingFile: Ref<boolean>;
  showExternalLinkDialog: Ref<boolean>;
  pendingExternalUrl: Ref<string>;
  openFile: () => Promise<void>;
  openFileFromPath: (filePath: string) => Promise<void>;
  saveFile: () => Promise<void>;
  saveFileAs: () => Promise<void>;
  exportPdf: () => Promise<void>;
  handleLinkClick: (href: string) => void;
  confirmExternalLink: () => Promise<void>;
  cancelExternalLink: () => void;
  openFileInNewTab: (relativePath: string) => Promise<void>;
}

export function useFileOperations(options: UseFileOperationsOptions): UseFileOperationsReturn {
  const {
    tabs,
    activeTabId,
    activeTab,
    findTabByFilePath,
    createNewTab,
    switchToTab,
    getEditorHtml,
    getMarkdownOverride,
    setEditorContent,
    markSaveStart,
    markSaveEnd,
    onFileOpened,
    onPreSaveConflict,
  } = options;

  const currentFile = computed(() => activeTab.value?.filePath || null);
  const isLoadingFile = ref(false);

  // External link confirmation state
  const showExternalLinkDialog = ref(false);
  const pendingExternalUrl = ref('');

  // Get directory from file path
  const getDirectoryFromPath = (filePath: string): string => {
    const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
    return lastSlash > 0 ? filePath.substring(0, lastSlash) : '';
  };

  const extractFileName = (filePath: string): string =>
    filePath.split(/[/\\]/).pop() || DEFAULT_FILE_NAME;

  const isActiveTabEmpty = (): boolean =>
    !activeTab.value?.filePath && !activeTab.value?.hasChanges && activeTab.value?.content === EMPTY_TAB_CONTENT;

  const findActiveTabIndex = (): number =>
    tabs.value.findIndex(t => t.id === activeTabId.value);

  const loadFileIntoTab = async (filePath: string): Promise<void> => {
    // Check if file is already open
    const existingTab = findTabByFilePath(filePath);
    if (existingTab) {
      await switchToTab(existingTab.id);
      return;
    }

    const fileContent = await readTextFile(filePath);
    const htmlContent = markdownToHtml(fileContent);
    const fileName = extractFileName(filePath);

    // If current tab is empty and has no changes, replace it
    if (isActiveTabEmpty()) {
      const tabIndex = findActiveTabIndex();
      if (tabIndex !== -1) {
        tabs.value[tabIndex].filePath = filePath;
        tabs.value[tabIndex].fileName = fileName;
        tabs.value[tabIndex].content = htmlContent;
        tabs.value[tabIndex].hasChanges = false;
        tabs.value[tabIndex].originalMarkdown = fileContent;
        setEditorContent(htmlContent);
      }
    } else {
      const newTabId = createNewTab(filePath, htmlContent, fileName);
      const newTab = tabs.value.find(t => t.id === newTabId);
      if (newTab) newTab.originalMarkdown = fileContent;
      await switchToTab(newTabId);
    }

    onFileOpened?.(filePath, fileContent);
  };

  const openFile = async (): Promise<void> => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown'] },
          { name: 'Wszystkie pliki', extensions: ['*'] },
        ],
      });

      if (selected) {
        await loadFileIntoTab(selected as string);
      }
    } catch (error) {
      console.error('Error opening file:', error);
    }
  };

  const openFileFromPath = async (filePath: string): Promise<void> => {
    try {
      await loadFileIntoTab(filePath);
    } catch (error) {
      console.error('Error opening file from path:', error);
    }
  };

  // Returns disk content if a conflict is detected, null otherwise.
  const checkPreSaveConflict = async (filePath: string, originalMarkdown: string | null): Promise<string | null> => {
    if (!originalMarkdown || !onPreSaveConflict) return null;
    try {
      const currentDiskContent = await readTextFile(filePath);
      // Normalize line endings for comparison
      const normalizedDisk = currentDiskContent.replace(/\r\n/g, '\n');
      const normalizedOriginal = originalMarkdown.replace(/\r\n/g, '\n');
      return normalizedDisk !== normalizedOriginal ? currentDiskContent : null;
    } catch {
      return null; // File might not exist yet (new file)
    }
  };

  const atomicWriteFile = async (filePath: string, content: string): Promise<void> => {
    const tmpPath = filePath + '.tmp';
    try {
      markSaveStart?.(filePath);
      await writeTextFile(tmpPath, content);
      // Verify written content matches expected
      const written = await readTextFile(tmpPath);
      if (written !== content) {
        throw new Error('Atomic save verification failed: written content does not match');
      }
      await rename(tmpPath, filePath);
      markSaveEnd?.(filePath, content);
    } catch (error) {
      markSaveEnd?.(filePath, content); // release watcher guard even on failure
      try { await remove(tmpPath); } catch { /* temp file may not exist */ }
      throw error;
    }
  };

  const writeAndUpdateTab = async (filePath: string): Promise<void> => {
    // When in code view, getMarkdownOverride() returns the raw markdown directly —
    // avoids the empty-content bug caused by SplitContainer being unmounted.
    const markdownOverride = getMarkdownOverride?.() ?? null;
    const html = markdownOverride === null ? getEditorHtml() : null;
    let markdown = (markdownOverride ?? htmlToMarkdown(html!)).trimEnd();

    const tabIndex = findActiveTabIndex();

    // Preserve original line endings if we have the original content
    if (tabIndex !== -1 && tabs.value[tabIndex].originalMarkdown) {
      const originalLineEnding = detectLineEnding(tabs.value[tabIndex].originalMarkdown!);
      markdown = applyLineEnding(markdown, originalLineEnding);
    }

    markdown = markdown.trimEnd();

    // Pre-save conflict check
    let mergedContentApplied = false;
    if (tabIndex !== -1 && onPreSaveConflict) {
      const diskContent = await checkPreSaveConflict(filePath, tabs.value[tabIndex].originalMarkdown);
      if (diskContent !== null) {
        const decision = await onPreSaveConflict(filePath, diskContent, markdown);
        if (decision === 'cancel') return;
        // If user applied a manual merge, use the merged content instead.
        // The conflict handler already called reloadTabContent to update the editor —
        // skip the tab.content = html overwrite below so the merged view isn't reverted.
        if (decision !== 'save') {
          markdown = decision;
          mergedContentApplied = true;
        }
      }
    }

    await atomicWriteFile(filePath, markdown);

    if (tabIndex !== -1) {
      tabs.value[tabIndex].filePath = filePath;
      tabs.value[tabIndex].fileName = extractFileName(filePath);
      tabs.value[tabIndex].hasChanges = false;
      // Only update cached HTML when saving from visual mode — in code view the HTML
      // will be regenerated from the saved markdown when switching back to visual mode.
      // Skip when merged content was applied: the conflict handler already set tab.content
      // via reloadTabContent; overwriting it here with pre-dialog html would revert the editor.
      if (html !== null && !mergedContentApplied) {
        tabs.value[tabIndex].content = html;
      }
      tabs.value[tabIndex].originalMarkdown = markdown;
    }
  };

  const saveFile = async (): Promise<void> => {
    try {
      let filePath = currentFile.value;
      const tabIndex = findActiveTabIndex();

      // Skip save if file exists and has no changes
      if (filePath && tabIndex !== -1 && !tabs.value[tabIndex].hasChanges) {
        return;
      }

      if (!filePath) {
        filePath = await save({
          filters: [{ name: 'Markdown', extensions: ['md'] }],
          defaultPath: 'dokument.md',
        });
      }

      if (filePath) {
        await writeAndUpdateTab(filePath);
      }
    } catch (error) {
      console.error('Error saving file:', error);
    }
  };

  const saveFileAs = async (): Promise<void> => {
    try {
      const filePath = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        defaultPath: currentFile.value?.split(/[/\\]/).pop() || 'dokument.md',
      });

      if (filePath) {
        await writeAndUpdateTab(filePath);
      }
    } catch (error) {
      console.error('Error saving file:', error);
    }
  };

  const exportPdf = async (): Promise<void> => {
    document.body.classList.add('printing');

    try {
      // Maximize window before printing to ensure dialog is fully visible
      const appWindow = getCurrentWindow();
      const wasMaximized = await appWindow.isMaximized();

      if (!wasMaximized) {
        await appWindow.maximize();
        // Wait for window to finish maximizing
        await new Promise(resolve => setTimeout(resolve, TIMING.MAXIMIZE_ANIMATION_DELAY));
      }

      // Use standard browser print
      window.print();

      // Restore window state if it wasn't maximized before
      if (!wasMaximized) {
        await appWindow.unmaximize();
      }
    } catch (error) {
      console.error('Print error:', error);
      // Fallback to window.print() if Tauri API fails
      window.print();
    }

    document.body.classList.remove('printing');
  };

  const openFileInNewTab = async (relativePath: string): Promise<void> => {
    try {
      // Save current scroll position before navigating
      const editorContainer = document.querySelector(DOM_SELECTORS.EDITOR_CONTAINER);
      if (editorContainer && activeTab.value) {
        const tabIndex = findActiveTabIndex();
        if (tabIndex !== -1) {
          tabs.value[tabIndex].scrollTop = editorContainer.scrollTop;
        }
      }

      isLoadingFile.value = true;

      // Get current file's directory as base
      const baseDir = currentFile.value ? getDirectoryFromPath(currentFile.value) : '';

      // Resolve the relative path
      let fullPath = relativePath;
      if (baseDir && !relativePath.match(/^[a-zA-Z]:/)) {
        fullPath = `${baseDir}/${relativePath}`.replace(/\\/g, '/');
        const parts = fullPath.split('/');
        const normalized: string[] = [];
        for (const part of parts) {
          if (part === '..') {
            normalized.pop();
          } else if (part !== '.' && part !== '') {
            normalized.push(part);
          }
        }
        fullPath = normalized.join('/');
        if (fullPath.match(/^[a-zA-Z]\//)) {
          fullPath = fullPath.replace(/^([a-zA-Z])\//, '$1:/');
        }
      }

      // Check if file is already open
      const existingTab = findTabByFilePath(fullPath);
      if (existingTab) {
        await switchToTab(existingTab.id);
        isLoadingFile.value = false;
        return;
      }

      // Read the file
      const fileContent = await readTextFile(fullPath);
      const htmlContent = markdownToHtml(fileContent);
      const fileName = extractFileName(fullPath);

      // Create new tab and switch to it
      const newTabId = createNewTab(fullPath, htmlContent, fileName);
      const newTab = tabs.value.find(t => t.id === newTabId);
      if (newTab) {
        newTab.originalMarkdown = fileContent;
      }
      await switchToTab(newTabId);
      onFileOpened?.(fullPath, fileContent);
      isLoadingFile.value = false;
    } catch (error) {
      console.error('Error opening file in new tab:', error);
      isLoadingFile.value = false;
    }
  };

  const handleLinkClick = (href: string): void => {
    // Anchor link (internal navigation)
    if (href.startsWith('#')) {
      const targetId = href.slice(1);
      const editorContainer = document.querySelector(DOM_SELECTORS.EDITOR_CONTAINER);
      const targetElement = editorContainer?.querySelector(`[id="${targetId}"]`) as HTMLElement | null;
      if (targetElement && editorContainer) {
        const containerRect = editorContainer.getBoundingClientRect();
        const elementRect = targetElement.getBoundingClientRect();
        const scrollOffset = elementRect.top - containerRect.top + editorContainer.scrollTop - 20;
        editorContainer.scrollTo({ top: scrollOffset, behavior: 'smooth' });
      }
      return;
    }

    // Relative markdown link
    if (href.endsWith('.md') || href.endsWith('.markdown')) {
      openFileInNewTab(href);
    } else if (href.startsWith('http://') || href.startsWith('https://') || (href.includes('.') && !href.includes('/'))) {
      // External link
      pendingExternalUrl.value = href.startsWith('http') ? href : `https://${href}`;
      showExternalLinkDialog.value = true;
    } else {
      // Could be a relative link to any file
      openFileInNewTab(href);
    }
  };

  const confirmExternalLink = async (): Promise<void> => {
    if (pendingExternalUrl.value) {
      try {
        await openExternal(pendingExternalUrl.value);
      } catch (error) {
        console.error('Error opening external link:', error);
      }
    }
    showExternalLinkDialog.value = false;
    pendingExternalUrl.value = '';
  };

  const cancelExternalLink = (): void => {
    showExternalLinkDialog.value = false;
    pendingExternalUrl.value = '';
  };

  return {
    currentFile,
    isLoadingFile,
    showExternalLinkDialog,
    pendingExternalUrl,
    openFile,
    openFileFromPath,
    saveFile,
    saveFileAs,
    exportPdf,
    handleLinkClick,
    confirmExternalLink,
    cancelExternalLink,
    openFileInNewTab,
  };
}
