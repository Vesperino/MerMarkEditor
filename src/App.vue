<script setup lang="ts">
import { ref, provide, computed, watchEffect, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { open } from '@tauri-apps/plugin-dialog';
import type { Editor as TiptapEditor } from '@tiptap/vue-3';
import { htmlToMarkdown } from './utils/markdown-converter';

// Components
import Toolbar from './components/Toolbar.vue';
import LoadingOverlay from './components/LoadingOverlay.vue';
import ExternalLinkDialog from './components/ExternalLinkDialog.vue';
import UpdateDialog from './components/UpdateDialog.vue';
import CodeEditor from './components/CodeEditor.vue';
import SaveConfirmDialog from './components/SaveConfirmDialog.vue';
import SplitContainer from './components/SplitContainer.vue';

// Composables
import { useAutoUpdate } from './composables/useAutoUpdate';
import { useCodeView } from './composables/useCodeView';
import { useSettings } from './composables/useSettings';
import { useSplitView } from './composables/useSplitView';
import { useFileOperations } from './composables/useFileOperations';
import { useCloseConfirmation } from './composables/useCloseConfirmation';
import { useWindowManager } from './composables/useWindowManager';
import { useTabDrag } from './composables/useTabDrag';

// ============ Split View & Tab Management ============
const {
  splitState,
  activePaneId,
  activePane,
  isSplitActive,
  toggleSplit,
  createTab,
  closeTab: closeTabFromSplit,
  switchTab,
  findTabByFilePath: findTabByFilePathSplit,
  getActiveTabForPane,
  getAllUnsavedTabs,
  isWindowEmpty,
  disableSplit,
} = useSplitView();

const {
  closeCurrentWindow,
  registerOpenFile,
  unregisterOpenFile,
  unregisterWindowFiles,
  checkFileOpen,
  focusWindowWithFile,
  onFocusFile,
  getCurrentWindowLabel,
} = useWindowManager();

// Compatibility layer for legacy code
const tabs = computed(() => activePane.value?.tabs || []);
const activeTabId = computed(() => activePane.value?.activeTabId || '');
const activeTab = computed(() => {
  const tab = getActiveTabForPane(activePaneId.value);
  // Return a default tab if none exists (should never happen in practice)
  return tab || { id: '', filePath: null, fileName: 'Nowy dokument', content: '<p></p>', hasChanges: false, scrollTop: 0 };
});

// ============ Editor References ============
const splitContainerRef = ref<InstanceType<typeof SplitContainer> | null>(null);
const editorInstance = ref<TiptapEditor | null>(null);
// Start as true to prevent initial change detection from marking document as changed
const isLoadingContent = ref(true);

// Provide editor to child components (get from active pane)
const updateEditorInstance = () => {
  if (splitContainerRef.value) {
    const paneRef = activePaneId.value === 'left'
      ? splitContainerRef.value.leftPaneRef
      : splitContainerRef.value.rightPaneRef;
    // The editor is exposed as a computed, but ref unwrapping happens automatically
    if (paneRef?.editor) {
      editorInstance.value = paneRef.editor as unknown as TiptapEditor;
    }
  }
};

watch(activePaneId, updateEditorInstance, { immediate: true });

provide('editor', editorInstance);

// ============ Computed Properties ============
const currentFile = computed(() => activeTab.value?.filePath || null);
const hasChanges = computed(() => activeTab.value?.hasChanges || false);

provide('currentFile', currentFile);
provide('hasChanges', hasChanges);

// ============ Window Title ============
const windowTitle = computed(() => {
  const fileName = activeTab.value?.fileName || 'Nowy dokument';
  const changeIndicator = activeTab.value?.hasChanges ? ' *' : '';
  return `${fileName}${changeIndicator} - MdReader`;
});

watchEffect(() => {
  document.title = windowTitle.value;
});

// ============ Tab Operations (with editor integration) ============
const getEditorContent = () => {
  if (splitContainerRef.value) {
    return splitContainerRef.value.getActiveEditorContent();
  }
  return '<p></p>';
};

const setEditorContent = (content: string) => {
  if (splitContainerRef.value) {
    isLoadingContent.value = true;
    splitContainerRef.value.setActiveEditorContent(content);
    nextTick(() => {
      isLoadingContent.value = false;
    });
  }
};

const switchToTab = async (tabId: string) => {
  // Save current scroll position for active pane
  const editorContainer = document.querySelector('.editor-pane.active .editor-container');
  if (editorContainer && activePane.value) {
    activePane.value.scrollTop = editorContainer.scrollTop;
  }

  const targetTab = tabs.value.find(t => t.id === tabId);
  const targetScrollTop = targetTab?.scrollTop || 0;

  // Switch tab in the active pane
  switchTab(activePaneId.value, tabId);

  // Restore scroll position after content is loaded
  await nextTick();
  const newContainer = document.querySelector('.editor-pane.active .editor-container');
  if (newContainer) {
    newContainer.scrollTop = targetScrollTop;
  }
};

// Create new tab in active pane
const createNewTab = (filePath?: string | null, content?: string, fileName?: string): string => {
  return createTab(activePaneId.value, filePath, content, fileName);
};

// Find tab by file path across all panes
const findTabByFilePath = (filePath: string) => {
  const result = findTabByFilePathSplit(filePath);
  return result?.tab;
};

// ============ Tab Close Confirmation ============
const showTabCloseDialog = ref(false);
const tabToClose = ref<{ id: string; paneId: string; fileName: string } | null>(null);

const closeTabAndCheckWindow = async (paneId: string, tabId: string) => {
  // Get the file path before closing to unregister it
  const pane = splitState.value.panes.find(p => p.id === paneId);
  const tab = pane?.tabs.find(t => t.id === tabId);
  const filePath = tab?.filePath;

  closeTabFromSplit(paneId, tabId);

  // Unregister the file from the global registry
  if (filePath) {
    try {
      await unregisterOpenFile(filePath);
    } catch (error) {
      console.error('[App] Error unregistering file:', error);
    }
  }

  if (isWindowEmpty()) {
    await closeCurrentWindow();
    return;
  }

  if (isSplitActive.value) {
    const paneAfter = splitState.value.panes.find(p => p.id === paneId);
    if (paneAfter && paneAfter.tabs.length === 0) {
      disableSplit();
    }
  }
};

const handleCloseTabRequest = (paneId: string, tabId: string) => {
  const pane = splitState.value.panes.find(p => p.id === paneId);
  const tab = pane?.tabs.find(t => t.id === tabId);

  if (tab?.hasChanges) {
    tabToClose.value = { id: tabId, paneId, fileName: tab.fileName };
    showTabCloseDialog.value = true;
    return;
  }
  closeTabAndCheckWindow(paneId, tabId);
};

const handleTabCloseSave = async () => {
  if (!tabToClose.value) return;

  const pane = splitState.value.panes.find(p => p.id === tabToClose.value!.paneId);
  const tab = pane?.tabs.find(t => t.id === tabToClose.value!.id);

  if (tab) {
    if (activeTabId.value !== tab.id || activePaneId.value !== tabToClose.value.paneId) {
      splitState.value.activePaneId = tabToClose.value.paneId;
      await switchToTab(tab.id);
    }
    await saveFile();
    if (!tab.hasChanges) {
      showTabCloseDialog.value = false;
      const closePaneId = tabToClose.value.paneId;
      const closeTabId = tabToClose.value.id;
      tabToClose.value = null;
      await closeTabAndCheckWindow(closePaneId, closeTabId);
    }
  }
};

const handleTabCloseDiscard = async () => {
  if (!tabToClose.value) return;

  const pane = splitState.value.panes.find(p => p.id === tabToClose.value!.paneId);
  const tab = pane?.tabs.find(t => t.id === tabToClose.value!.id);

  if (tab) {
    tab.hasChanges = false;
  }
  showTabCloseDialog.value = false;
  const closePaneId = tabToClose.value.paneId;
  const closeTabId = tabToClose.value.id;
  tabToClose.value = null;
  await closeTabAndCheckWindow(closePaneId, closeTabId);
};

const handleTabCloseCancel = () => {
  showTabCloseDialog.value = false;
  tabToClose.value = null;
};

// ============ File Operations ============
const {
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
} = useFileOperations({
  tabs,
  activeTabId,
  activeTab,
  findTabByFilePath,
  createNewTab,
  switchToTab,
  getEditorHtml: getEditorContent,
  setEditorContent,
});

// ============ Code View ============
const codeEditorComponentRef = ref<InstanceType<typeof CodeEditor> | null>(null);

const {
  codeView,
  codeContent,
  codeEditorRef,
  toggleCodeView: toggleCodeViewBase,
  onCodeContentUpdate,
} = useCodeView({
  getActiveContent: () => activeTab.value?.content || '<p></p>',
  setActiveContent: (content: string) => {
    if (activeTab.value) {
      activeTab.value.content = content;
    }
  },
  markAsChanged: () => {
    if (activeTab.value) {
      activeTab.value.hasChanges = true;
    }
  },
});

// Sync code editor ref with component's textarea
watch(
  () => codeEditorComponentRef.value?.textarea,
  (textarea) => {
    if (textarea) {
      codeEditorRef.value = textarea;
    }
  },
  { immediate: true }
);

const toggleCodeView = async () => {
  const wasInCodeView = codeView.value;

  // Save scroll position before toggling
  const editorContainer = document.querySelector('.editor-pane.active .editor-container');
  const savedScrollTop = editorContainer?.scrollTop || 0;

  // Cast to satisfy type checker - the types are compatible
  await toggleCodeViewBase(editorInstance.value as Parameters<typeof toggleCodeViewBase>[0]);

  if (wasInCodeView && !codeView.value) {
    // Returning from code view - update editor content
    isLoadingContent.value = true;
    if (editorInstance.value && activeTab.value) {
      editorInstance.value.commands.setContent(activeTab.value.content);
      await nextTick();

      // Restore scroll position that was set by toggleCodeViewBase
      // or use the saved position as fallback
      await nextTick();
      const container = document.querySelector('.editor-pane.active .editor-container');
      if (container) {
        // Allow a moment for DOM to settle after setContent
        requestAnimationFrame(() => {
          const containerEl = document.querySelector('.editor-pane.active .editor-container');
          if (containerEl && containerEl.scrollTop === 0 && savedScrollTop > 0) {
            // If scroll was reset, try to restore
            containerEl.scrollTop = savedScrollTop;
          }
          // Focus after scroll is restored
          editorInstance.value?.commands.focus();
        });
      }
    }
    await nextTick();
    isLoadingContent.value = false;
  }
};

// ============ Auto Update ============
const {
  showUpdateDialog,
  updateInfo,
  updateProgress,
  isUpdating,
  updateError,
  checkForUpdates,
  downloadAndInstallUpdate,
  closeUpdateDialog,
} = useAutoUpdate();

// ============ Settings ============
const { settings } = useSettings();

// ============ Sync Active Tab Content ============
// This ensures that the active tab's content and hasChanges are up to date
// before checking for unsaved changes (e.g., when closing the window)
const syncActiveTabContent = () => {
  const currentContent = getEditorContent();
  const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
  if (tabIndex !== -1) {
    tabs.value[tabIndex].content = currentContent;
    // Check if content differs from the original (when file was loaded/saved)
    // hasChanges should already be tracked, but ensure it's synced
  }
};

// ============ Close Confirmation ============
const {
  showSaveConfirmDialog,
  currentTabToSave,
  tabsToSaveCount,
  currentTabIndex,
  setupCloseHandler,
  handleSave,
  handleDiscard,
  handleCancel,
} = useCloseConfirmation({
  tabs,
  activeTabId,
  getEditorHtml: getEditorContent,
  switchToTab,
  syncActiveTabContent,
});

// ============ Auto-save ============
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

// Save a specific tab from any pane
const saveTabFromPane = async (paneId: string, tabId: string) => {
  const pane = splitState.value.panes.find(p => p.id === paneId);
  const tab = pane?.tabs.find(t => t.id === tabId);
  if (!tab?.filePath || !tab?.hasChanges) return;

  try {
    // For active tab in active pane, get fresh content from editor; for others, use stored content
    const isActiveTab = tabId === activeTabId.value && paneId === activePaneId.value;
    const html = isActiveTab ? getEditorContent() : tab.content;
    const markdown = htmlToMarkdown(html);
    await writeTextFile(tab.filePath, markdown);

    // Update tab state
    tab.hasChanges = false;
    tab.content = html;
  } catch (error) {
    console.error('Błąd automatycznego zapisywania:', error);
  }
};

// Save all tabs with unsaved changes across all panes
const autoSaveAllTabs = async () => {
  if (!settings.value.autoSave) return;

  // Sync active tab content first
  syncActiveTabContent();

  // Find all tabs with unsaved changes across all panes
  const unsavedTabs = getAllUnsavedTabs();

  for (const { paneId, tab } of unsavedTabs) {
    await saveTabFromPane(paneId, tab.id);
  }
};

const triggerAutoSave = () => {
  if (!settings.value.autoSave) return;

  // Check if any tab has unsaved changes across all panes
  const unsavedTabs = getAllUnsavedTabs();
  if (unsavedTabs.length === 0) return;

  // Clear existing timer
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  // Set new timer - save after 5 seconds of inactivity
  autoSaveTimer = setTimeout(() => {
    autoSaveAllTabs();
  }, 5000);
};

// Handle changes updated from SplitContainer
const handleChangesUpdated = (_paneId: string, _tabId: string, hasChanges: boolean) => {
  if (hasChanges) {
    triggerAutoSave();
  }
};

// Watch for autosave setting changes - if turned on with unsaved changes, trigger save
watch(() => settings.value.autoSave, (newValue) => {
  if (newValue) {
    const unsavedTabs = getAllUnsavedTabs();
    if (unsavedTabs.length > 0) {
      triggerAutoSave();
    }
  }
});

// ============ Keyboard Shortcuts ============
const handleKeyboard = (event: KeyboardEvent) => {
  const modifier = event.ctrlKey || event.metaKey;

  if (modifier) {
    switch (event.key.toLowerCase()) {
      case 's':
        event.preventDefault();
        if (event.shiftKey) {
          saveFileAs();
        } else {
          saveFile();
        }
        break;
      case 'o':
        event.preventDefault();
        openFileWithCrossWindowDialog();
        break;
      case 'p':
        event.preventDefault();
        exportPdf();
        break;
    }
  }
};

// ============ Lifecycle ============
let unlistenOpenFile: UnlistenFn | null = null;
let unlistenCloseRequest: (() => void) | null = null;
let unlistenTabTransfer: UnlistenFn | null = null;
let unlistenFocusFile: UnlistenFn | null = null;
let currentWindowLabel = '';

// Wrapper that checks if file is open locally or in another window first
const openFileWithCrossWindowCheck = async (filePath: string): Promise<void> => {
  try {
    // First check if file is already open locally in this window
    const localResult = findTabByFilePathSplit(filePath);
    if (localResult) {
      console.log(`[App] File already open locally, switching to tab:`, filePath);
      splitState.value.activePaneId = localResult.pane.id;
      switchTab(localResult.pane.id, localResult.tab.id);
      return;
    }

    // Check if file is open in another window
    const windowWithFile = await checkFileOpen(filePath);
    if (windowWithFile && windowWithFile !== currentWindowLabel) {
      // File is open in another window - focus that window
      console.log(`[App] File already open in window ${windowWithFile}, focusing...`);
      await focusWindowWithFile(filePath);
      return;
    }

    // File not open anywhere - open it normally
    await openFileFromPath(filePath);

    // Register the file after successful open
    if (currentWindowLabel) {
      await registerOpenFile(filePath, currentWindowLabel);
    }
  } catch (error) {
    console.error('[App] Error in cross-window file check:', error);
    // Fall back to normal open
    await openFileFromPath(filePath);
  }
};

// Open file dialog with cross-window check
const openFileWithCrossWindowDialog = async (): Promise<void> => {
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
      await openFileWithCrossWindowCheck(filePath);
    }
  } catch (error) {
    console.error('[App] Error opening file dialog:', error);
  }
};

onMounted(async () => {
  window.addEventListener('keydown', handleKeyboard);

  // Get current window label for file registry
  try {
    currentWindowLabel = await getCurrentWindowLabel();
    console.log('[App] Current window label:', currentWindowLabel);
  } catch (error) {
    console.error('[App] Error getting window label:', error);
  }

  // Set up close confirmation handler
  try {
    console.log('[App] Setting up close handler...');
    unlistenCloseRequest = await setupCloseHandler();
    console.log('[App] Close handler set up successfully');
  } catch (error) {
    console.error('[App] Błąd konfiguracji obsługi zamknięcia:', error);
  }

  // Check for file path from URL query parameters (for new windows created via drag)
  const { getFilePathFromUrl } = useWindowManager();
  const urlFilePath = getFilePathFromUrl();
  if (urlFilePath) {
    console.log('[App] Opening file from URL:', urlFilePath);
    await nextTick();
    setTimeout(() => openFileWithCrossWindowCheck(urlFilePath), 100);
  } else {
    // Check for file path from CLI arguments (for main window / file associations)
    try {
      const filePath = await invoke<string | null>('get_open_file_path');
      if (filePath) {
        await nextTick();
        setTimeout(() => openFileWithCrossWindowCheck(filePath), 100);
      }
    } catch (error) {
      console.error('Błąd pobierania ścieżki pliku:', error);
    }
  }

  // Listen for open-file events
  try {
    unlistenOpenFile = await listen<string>('open-file', (event) => {
      openFileWithCrossWindowCheck(event.payload);
    });
  } catch (error) {
    console.error('Błąd nasłuchiwania zdarzeń:', error);
  }

  // Listen for tab transfer events (from other windows)
  try {
    const { onTabTransfer } = useWindowManager();
    const { isRecentlyTransferred, markAsTransferred } = useTabDrag();
    unlistenTabTransfer = await onTabTransfer((payload) => {
      console.log('[App] Received tab transfer:', payload);

      // Check debounce to prevent transfer loops
      if (isRecentlyTransferred(payload.file_path)) {
        console.log('[App] Skipping transfer - file was recently transferred:', payload.file_path);
        return;
      }

      // Mark as transferred to prevent loops
      markAsTransferred(payload.file_path);
      openFileWithCrossWindowCheck(payload.file_path);
    });
  } catch (error) {
    console.error('Błąd nasłuchiwania transferu kart:', error);
  }

  // Listen for focus-file events (when another window asks us to focus a file)
  try {
    unlistenFocusFile = await onFocusFile((filePath) => {
      console.log('[App] Received focus-file request:', filePath);
      // Find and switch to the tab with this file
      const result = findTabByFilePathSplit(filePath);
      if (result) {
        splitState.value.activePaneId = result.pane.id;
        switchTab(result.pane.id, result.tab.id);
      }
    });
  } catch (error) {
    console.error('Błąd nasłuchiwania focus-file:', error);
  }

  // Enable change detection after editor stabilizes
  setTimeout(() => {
    isLoadingContent.value = false;
  }, 200);

  // Check for updates
  setTimeout(() => checkForUpdates(), 3000);
});

onUnmounted(async () => {
  window.removeEventListener('keydown', handleKeyboard);
  if (unlistenOpenFile) {
    unlistenOpenFile();
  }
  if (unlistenCloseRequest) {
    unlistenCloseRequest();
  }
  if (unlistenTabTransfer) {
    unlistenTabTransfer();
  }
  if (unlistenFocusFile) {
    unlistenFocusFile();
  }

  // Unregister all files for this window
  if (currentWindowLabel) {
    try {
      await unregisterWindowFiles(currentWindowLabel);
    } catch (error) {
      console.error('[App] Error unregistering window files:', error);
    }
  }
});
</script>

<template>
  <div class="app">
    <Toolbar
      :code-view="codeView"
      :is-split-active="isSplitActive"
      @open-file="openFileWithCrossWindowDialog"
      @save-file="saveFile"
      @save-file-as="saveFileAs"
      @export-pdf="exportPdf"
      @toggle-code-view="toggleCodeView"
      @toggle-split="toggleSplit"
    />

    <!-- Split Container with Editor Panes -->
    <SplitContainer
      v-if="!codeView"
      ref="splitContainerRef"
      @link-click="handleLinkClick"
      @close-tab-request="handleCloseTabRequest"
      @changes-updated="handleChangesUpdated"
    />

    <!-- Code View -->
    <CodeEditor
      v-else
      ref="codeEditorComponentRef"
      v-model="codeContent"
      @update:model-value="onCodeContentUpdate"
    />

    <!-- Loading Overlay -->
    <LoadingOverlay v-if="isLoadingFile" />

    <!-- External Link Dialog -->
    <ExternalLinkDialog
      v-if="showExternalLinkDialog"
      :url="pendingExternalUrl"
      @confirm="confirmExternalLink"
      @cancel="cancelExternalLink"
    />

    <!-- Update Dialog -->
    <UpdateDialog
      v-if="showUpdateDialog && updateInfo"
      :version="updateInfo.version"
      :notes="updateInfo.notes"
      :progress="updateProgress"
      :is-updating="isUpdating"
      :error="updateError"
      @close="closeUpdateDialog"
      @update="downloadAndInstallUpdate"
    />

    <!-- Save Confirmation Dialog (Window Close) -->
    <SaveConfirmDialog
      v-if="showSaveConfirmDialog && currentTabToSave"
      :file-name="currentTabToSave.tab.fileName"
      :current-index="currentTabIndex"
      :total-count="tabsToSaveCount"
      @save="handleSave"
      @discard="handleDiscard"
      @cancel="handleCancel"
    />

    <!-- Tab Close Confirmation Dialog -->
    <SaveConfirmDialog
      v-if="showTabCloseDialog && tabToClose"
      :file-name="tabToClose.fileName"
      :current-index="1"
      :total-count="1"
      @save="handleTabCloseSave"
      @discard="handleTabCloseDiscard"
      @cancel="handleTabCloseCancel"
    />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #ffffff;
}

@media print {
  .app {
    height: auto !important;
    overflow: visible !important;
    display: block !important;
  }

  .toolbar {
    display: none !important;
  }

  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid;
  }

  pre, blockquote, table, .mermaid-wrapper {
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
</style>
