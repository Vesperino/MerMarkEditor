<script setup lang="ts">
import { ref, provide, computed, watchEffect, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import type { Editor as TiptapEditor } from '@tiptap/vue-3';
import { htmlToMarkdown } from './utils/markdown-converter';

// Components
import Editor from './components/Editor.vue';
import Toolbar from './components/Toolbar.vue';
import TabBar from './components/TabBar.vue';
import LoadingOverlay from './components/LoadingOverlay.vue';
import ExternalLinkDialog from './components/ExternalLinkDialog.vue';
import UpdateDialog from './components/UpdateDialog.vue';
import CodeEditor from './components/CodeEditor.vue';
import SaveConfirmDialog from './components/SaveConfirmDialog.vue';

// Composables
import { useTabs } from './composables/useTabs';
import { useAutoUpdate } from './composables/useAutoUpdate';
import { useFileOperations } from './composables/useFileOperations';
import { useCodeView } from './composables/useCodeView';
import { useCloseConfirmation } from './composables/useCloseConfirmation';
import { useSettings } from './composables/useSettings';


// ============ Tab Management ============
const {
  tabs,
  activeTabId,
  activeTab,
  createNewTab,
  switchToTab: switchToTabBase,
  closeTab: closeTabBase,
  findTabByFilePath,
  updateTabContent,
  updateTabChanges,
  saveScrollPosition,
} = useTabs();

// ============ Editor References ============
const editorRef = ref<InstanceType<typeof Editor> | null>(null);
const editorInstance = ref<TiptapEditor | null>(null);
// Start as true to prevent initial change detection from marking document as changed
const isLoadingContent = ref(true);

// Provide editor to child components
watch(
  () => editorRef.value?.editor,
  (newEditor) => {
    if (newEditor) {
      editorInstance.value = newEditor as unknown as TiptapEditor;
    }
  },
  { immediate: true }
);

provide('editor', editorInstance);

// ============ Computed Properties ============
const currentFile = computed(() => activeTab.value?.filePath || null);
const hasChanges = computed(() => activeTab.value?.hasChanges || false);
const content = computed(() => activeTab.value?.content || '<p></p>');

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
const getEditorContent = () => editorRef.value?.editor?.getHTML() || '<p></p>';
const setEditorContent = (content: string) => {
  if (editorRef.value?.editor) {
    isLoadingContent.value = true;
    editorRef.value.editor.commands.setContent(content);
    nextTick(() => {
      isLoadingContent.value = false;
    });
  }
};

const switchToTab = async (tabId: string, preserveHasChanges = true) => {
  // Save current scroll position
  const editorContainer = document.querySelector('.editor-container');
  if (editorContainer) {
    saveScrollPosition(editorContainer.scrollTop);
  }

  const targetTab = tabs.value.find(t => t.id === tabId);
  const targetScrollTop = targetTab?.scrollTop || 0;

  await switchToTabBase(tabId, preserveHasChanges, getEditorContent, setEditorContent);

  // Restore scroll position after content is loaded
  await nextTick();
  if (editorContainer) {
    editorContainer.scrollTop = targetScrollTop;
  }
};

// ============ Tab Close Confirmation ============
const showTabCloseDialog = ref(false);
const tabToClose = ref<{ id: string; fileName: string } | null>(null);

const closeTab = async (tabId: string) => {
  // Check if tab has unsaved changes
  const tab = tabs.value.find(t => t.id === tabId);
  if (tab?.hasChanges) {
    // Show confirmation dialog
    tabToClose.value = { id: tabId, fileName: tab.fileName };
    showTabCloseDialog.value = true;
    return;
  }
  await closeTabBase(tabId, getEditorContent, setEditorContent);
};

const handleTabCloseSave = async () => {
  if (!tabToClose.value) return;

  const tab = tabs.value.find(t => t.id === tabToClose.value!.id);
  if (tab) {
    // Switch to the tab first if not active
    if (activeTabId.value !== tab.id) {
      await switchToTab(tab.id, true);
    }
    // Save the file
    await saveFile();
    // If save was successful (hasChanges becomes false), close the tab
    if (!tab.hasChanges) {
      showTabCloseDialog.value = false;
      await closeTabBase(tabToClose.value.id, getEditorContent, setEditorContent);
      tabToClose.value = null;
    }
  }
};

const handleTabCloseDiscard = async () => {
  if (!tabToClose.value) return;

  const tab = tabs.value.find(t => t.id === tabToClose.value!.id);
  if (tab) {
    tab.hasChanges = false;
  }
  showTabCloseDialog.value = false;
  await closeTabBase(tabToClose.value.id, getEditorContent, setEditorContent);
  tabToClose.value = null;
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
  const editorContainer = document.querySelector('.editor-container');
  const savedScrollTop = editorContainer?.scrollTop || 0;

  await toggleCodeViewBase(editorRef.value?.editor);

  if (wasInCodeView && !codeView.value) {
    // Returning from code view - update editor content
    isLoadingContent.value = true;
    if (editorRef.value?.editor && activeTab.value) {
      editorRef.value.editor.commands.setContent(activeTab.value.content);
      await nextTick();

      // Restore scroll position that was set by toggleCodeViewBase
      // or use the saved position as fallback
      await nextTick();
      const container = document.querySelector('.editor-container');
      if (container) {
        // Allow a moment for DOM to settle after setContent
        requestAnimationFrame(() => {
          const containerEl = document.querySelector('.editor-container');
          if (containerEl && containerEl.scrollTop === 0 && savedScrollTop > 0) {
            // If scroll was reset, try to restore
            containerEl.scrollTop = savedScrollTop;
          }
          // Focus after scroll is restored
          editorRef.value?.editor?.commands.focus();
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

// Save a specific tab (works for both active and inactive tabs)
const saveTabById = async (tabId: string) => {
  const tab = tabs.value.find(t => t.id === tabId);
  if (!tab?.filePath || !tab?.hasChanges) return;

  try {
    // For active tab, get fresh content from editor; for others, use stored content
    const html = tabId === activeTabId.value ? getEditorContent() : tab.content;
    const markdown = htmlToMarkdown(html);
    await writeTextFile(tab.filePath, markdown);

    // Update tab state
    tab.hasChanges = false;
    tab.content = html;
  } catch (error) {
    console.error('Błąd automatycznego zapisywania:', error);
  }
};

// Save all tabs with unsaved changes
const autoSaveAllTabs = async () => {
  if (!settings.value.autoSave) return;

  // Sync active tab content first
  syncActiveTabContent();

  // Find all tabs with unsaved changes and a file path
  const tabsToSave = tabs.value.filter(t => t.filePath && t.hasChanges);

  for (const tab of tabsToSave) {
    await saveTabById(tab.id);
  }
};

const triggerAutoSave = () => {
  if (!settings.value.autoSave) return;

  // Check if any tab has unsaved changes
  const hasUnsavedTabs = tabs.value.some(t => t.filePath && t.hasChanges);
  if (!hasUnsavedTabs) return;

  // Clear existing timer
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
  }

  // Set new timer - save after 5 seconds of inactivity
  autoSaveTimer = setTimeout(() => {
    autoSaveAllTabs();
  }, 5000);
};

// Watch for autosave setting changes - if turned on with unsaved changes, trigger save
watch(() => settings.value.autoSave, (newValue) => {
  if (newValue) {
    const hasUnsavedTabs = tabs.value.some(t => t.filePath && t.hasChanges);
    if (hasUnsavedTabs) {
      triggerAutoSave();
    }
  }
});

// ============ Content Updates ============
const onContentUpdate = (newContent: string) => {
  updateTabContent(newContent);
};

const onChangesUpdate = (changed: boolean) => {
  if (isLoadingContent.value) return;
  updateTabChanges(changed);
  if (changed) {
    triggerAutoSave();
  }
};

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
        openFile();
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

onMounted(async () => {
  window.addEventListener('keydown', handleKeyboard);

  // Set up close confirmation handler
  try {
    console.log('[App] Setting up close handler...');
    unlistenCloseRequest = await setupCloseHandler();
    console.log('[App] Close handler set up successfully');
  } catch (error) {
    console.error('[App] Błąd konfiguracji obsługi zamknięcia:', error);
  }

  // Check for file path from CLI arguments
  try {
    const filePath = await invoke<string | null>('get_open_file_path');
    if (filePath) {
      await nextTick();
      setTimeout(() => openFileFromPath(filePath), 100);
    }
  } catch (error) {
    console.error('Błąd pobierania ścieżki pliku:', error);
  }

  // Listen for open-file events
  try {
    unlistenOpenFile = await listen<string>('open-file', (event) => {
      openFileFromPath(event.payload);
    });
  } catch (error) {
    console.error('Błąd nasłuchiwania zdarzeń:', error);
  }

  // Enable change detection after editor stabilizes
  setTimeout(() => {
    isLoadingContent.value = false;
  }, 200);

  // Check for updates
  setTimeout(() => checkForUpdates(), 3000);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboard);
  if (unlistenOpenFile) {
    unlistenOpenFile();
  }
  if (unlistenCloseRequest) {
    unlistenCloseRequest();
  }
});
</script>

<template>
  <div class="app">
    <Toolbar
      :code-view="codeView"
      @open-file="openFile"
      @save-file="saveFile"
      @save-file-as="saveFileAs"
      @export-pdf="exportPdf"
      @toggle-code-view="toggleCodeView"
    />

    <!-- Tab Bar -->
    <TabBar
      v-if="tabs.length > 1"
      :tabs="tabs"
      :active-tab-id="activeTabId"
      @switch-tab="switchToTab"
      @close-tab="closeTab"
    />

    <!-- Visual Editor -->
    <Editor
      v-if="!codeView"
      ref="editorRef"
      :model-value="content"
      @update:model-value="onContentUpdate"
      @update:has-changes="onChangesUpdate"
      @link-click="handleLinkClick"
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
