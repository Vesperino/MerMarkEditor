import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { htmlToMarkdown, markdownToHtml } from '../utils/markdown-converter';
import type { Tab } from './useTabs';

export interface UseFileOperationsOptions {
  tabs: Ref<Tab[]>;
  activeTabId: Ref<string>;
  activeTab: ComputedRef<Tab>;
  findTabByFilePath: (filePath: string) => Tab | undefined;
  createNewTab: (filePath?: string | null, fileContent?: string, fileName?: string) => string;
  switchToTab: (tabId: string, preserveHasChanges?: boolean) => Promise<void>;
  getEditorHtml: () => string;
  setEditorContent: (content: string) => void;
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
    setEditorContent,
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
        const filePath = selected as string;

        // Check if file is already open
        const existingTab = findTabByFilePath(filePath);
        if (existingTab) {
          await switchToTab(existingTab.id);
          return;
        }

        const fileContent = await readTextFile(filePath);
        const htmlContent = markdownToHtml(fileContent);
        const fileName = filePath.split(/[/\\]/).pop() || 'Dokument';

        // If current tab is empty and has no changes, replace it
        if (!activeTab.value?.filePath && !activeTab.value?.hasChanges && activeTab.value?.content === '<p></p>') {
          const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
          if (tabIndex !== -1) {
            tabs.value[tabIndex].filePath = filePath;
            tabs.value[tabIndex].fileName = fileName;
            tabs.value[tabIndex].content = htmlContent;
            tabs.value[tabIndex].hasChanges = false;
            setEditorContent(htmlContent);
          }
        } else {
          const newTabId = createNewTab(filePath, htmlContent, fileName);
          await switchToTab(newTabId);
        }
      }
    } catch (error) {
      console.error('Błąd otwierania pliku:', error);
    }
  };

  const openFileFromPath = async (filePath: string): Promise<void> => {
    try {
      // Check if file is already open
      const existingTab = findTabByFilePath(filePath);
      if (existingTab) {
        await switchToTab(existingTab.id);
        return;
      }

      const fileContent = await readTextFile(filePath);
      const htmlContent = markdownToHtml(fileContent);
      const fileName = filePath.split(/[/\\]/).pop() || 'Dokument';

      // If current tab is empty and has no changes, replace it
      if (!activeTab.value?.filePath && !activeTab.value?.hasChanges && activeTab.value?.content === '<p></p>') {
        const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
        if (tabIndex !== -1) {
          tabs.value[tabIndex].filePath = filePath;
          tabs.value[tabIndex].fileName = fileName;
          tabs.value[tabIndex].content = htmlContent;
          tabs.value[tabIndex].hasChanges = false;
          setEditorContent(htmlContent);
        }
      } else {
        const newTabId = createNewTab(filePath, htmlContent, fileName);
        await switchToTab(newTabId);
      }
    } catch (error) {
      console.error('Błąd otwierania pliku z argumentów:', error);
    }
  };

  const saveFile = async (): Promise<void> => {
    try {
      let filePath = currentFile.value;

      if (!filePath) {
        filePath = await save({
          filters: [{ name: 'Markdown', extensions: ['md'] }],
          defaultPath: 'dokument.md',
        });
      }

      if (filePath) {
        const html = getEditorHtml();
        const markdown = htmlToMarkdown(html);
        await writeTextFile(filePath, markdown);

        // Update the active tab
        const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
        if (tabIndex !== -1) {
          tabs.value[tabIndex].filePath = filePath;
          tabs.value[tabIndex].fileName = filePath.split(/[/\\]/).pop() || 'Dokument';
          tabs.value[tabIndex].hasChanges = false;
          tabs.value[tabIndex].content = html;
        }
      }
    } catch (error) {
      console.error('Błąd zapisywania pliku:', error);
    }
  };

  const saveFileAs = async (): Promise<void> => {
    try {
      const filePath = await save({
        filters: [{ name: 'Markdown', extensions: ['md'] }],
        defaultPath: currentFile.value?.split(/[/\\]/).pop() || 'dokument.md',
      });

      if (filePath) {
        const html = getEditorHtml();
        const markdown = htmlToMarkdown(html);
        await writeTextFile(filePath, markdown);

        const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
        if (tabIndex !== -1) {
          tabs.value[tabIndex].filePath = filePath;
          tabs.value[tabIndex].fileName = filePath.split(/[/\\]/).pop() || 'Dokument';
          tabs.value[tabIndex].hasChanges = false;
          tabs.value[tabIndex].content = html;
        }
      }
    } catch (error) {
      console.error('Błąd zapisywania pliku:', error);
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
        await new Promise(resolve => setTimeout(resolve, 200));
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
      const editorContainer = document.querySelector('.editor-container');
      if (editorContainer && activeTab.value) {
        const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
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
      const fileName = fullPath.split(/[/\\]/).pop() || 'Dokument';

      // Create new tab and switch to it
      const newTabId = createNewTab(fullPath, htmlContent, fileName);
      await switchToTab(newTabId);
      isLoadingFile.value = false;
    } catch (error) {
      console.error('Błąd otwierania pliku:', error);
      isLoadingFile.value = false;
    }
  };

  const handleLinkClick = (href: string): void => {
    // Anchor link (internal navigation)
    if (href.startsWith('#')) {
      const targetId = href.slice(1);
      const editorContainer = document.querySelector('.editor-container');
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
        console.error('Błąd otwierania linku:', error);
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
