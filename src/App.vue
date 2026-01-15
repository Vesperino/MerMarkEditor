<script setup lang="ts">
import { ref, provide, computed, watchEffect, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { Editor as TiptapEditor } from '@tiptap/vue-3';

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

const closeTab = async (tabId: string) => {
  await closeTabBase(tabId, getEditorContent, setEditorContent);
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
      isLoadingContent.value = true;
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
  await toggleCodeViewBase(editorRef.value?.editor);
  if (!codeView.value) {
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
});

// ============ Content Updates ============
const onContentUpdate = (newContent: string) => {
  updateTabContent(newContent);
};

const onChangesUpdate = (changed: boolean) => {
  if (isLoadingContent.value) return;
  updateTabChanges(changed);
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

    <!-- Save Confirmation Dialog -->
    <SaveConfirmDialog
      v-if="showSaveConfirmDialog && currentTabToSave"
      :file-name="currentTabToSave.tab.fileName"
      :current-index="currentTabIndex"
      :total-count="tabsToSaveCount"
      @save="handleSave"
      @discard="handleDiscard"
      @cancel="handleCancel"
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
