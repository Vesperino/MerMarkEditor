<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import type { Pane } from '../types/pane';
import TabBar from './TabBar.vue';
import Editor from './Editor.vue';

const props = defineProps<{
  pane: Pane;
  isActive: boolean;
}>();

// Track if we're dragging over this pane
const isDragOver = ref(false);

const emit = defineEmits<{
  switchTab: [tabId: string];
  closeTab: [tabId: string];
  updateContent: [tabId: string, content: string];
  updateChanges: [tabId: string, hasChanges: boolean];
  linkClick: [href: string];
  focus: [];
  dropTab: [tabId: string, sourcePaneId: string, targetPaneId: string, targetIndex: number];
}>();

const editorRef = ref<InstanceType<typeof Editor> | null>(null);

// Get the active tab for this pane
const activeTab = computed(() => {
  return props.pane.tabs.find(t => t.id === props.pane.activeTabId);
});

// Content for the editor (from active tab)
const editorContent = computed(() => activeTab.value?.content || '<p></p>');

// Handle content updates from editor
const handleContentUpdate = (content: string) => {
  if (activeTab.value) {
    emit('updateContent', activeTab.value.id, content);
  }
};

// Handle changes flag updates
const handleChangesUpdate = (hasChanges: boolean) => {
  if (activeTab.value) {
    emit('updateChanges', activeTab.value.id, hasChanges);
  }
};

// Handle link clicks
const handleLinkClick = (href: string) => {
  emit('linkClick', href);
};

// Handle tab switching
const handleSwitchTab = (tabId: string) => {
  emit('switchTab', tabId);
};

// Handle tab closing
const handleCloseTab = (tabId: string) => {
  emit('closeTab', tabId);
};

// Handle focus on the pane
const handlePaneFocus = () => {
  emit('focus');
};

// Handle tab drop from TabBar
const handleDropTab = (tabId: string, sourcePaneId: string, targetIndex: number) => {
  console.log('[EditorPane] handleDropTab from TabBar:', { tabId, sourcePaneId, targetPaneId: props.pane.id, targetIndex });
  emit('dropTab', tabId, sourcePaneId, props.pane.id, targetIndex);
};

// Handle dragover on entire pane (allows dropping anywhere)
const handlePaneDragOver = (event: DragEvent) => {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  isDragOver.value = true;
};

// Handle dragleave on pane
const handlePaneDragLeave = (event: DragEvent) => {
  // Only reset if we're leaving the pane entirely (not just moving to a child)
  const relatedTarget = event.relatedTarget as HTMLElement;
  if (!relatedTarget || !event.currentTarget || !(event.currentTarget as HTMLElement).contains(relatedTarget)) {
    isDragOver.value = false;
  }
};

// Handle drop on the editor area (not on TabBar)
const handlePaneDrop = (event: DragEvent) => {
  event.preventDefault();
  isDragOver.value = false;
  console.log('[EditorPane] drop on pane:', props.pane.id);

  if (!event.dataTransfer) {
    console.log('[EditorPane] No dataTransfer on pane drop');
    return;
  }

  try {
    const rawData = event.dataTransfer.getData('text/plain');
    console.log('[EditorPane] Pane drop raw data:', rawData);
    const data = JSON.parse(rawData);
    // Drop at the end of tabs
    emit('dropTab', data.tabId, data.paneId, props.pane.id, props.pane.tabs.length);
  } catch (e) {
    console.error('[EditorPane] Failed to parse pane drop data:', e);
  }
};

// Watch for active tab changes to update editor content
watch(() => props.pane.activeTabId, async () => {
  await nextTick();
  if (editorRef.value?.editor && activeTab.value) {
    const currentContent = editorRef.value.editor.getHTML();
    if (currentContent !== activeTab.value.content) {
      editorRef.value.editor.commands.setContent(activeTab.value.content);
    }
  }
});

// Expose editor for external access (e.g., getting HTML content)
defineExpose({
  editor: computed(() => editorRef.value?.editor),
  getEditorContent: () => editorRef.value?.editor?.getHTML() || '',
  setEditorContent: (content: string) => {
    editorRef.value?.editor?.commands.setContent(content);
  },
});
</script>

<template>
  <div
    class="editor-pane"
    :class="{ active: isActive, 'drag-over': isDragOver }"
    @mousedown="handlePaneFocus"
    @focusin="handlePaneFocus"
    @dragover="handlePaneDragOver"
    @dragleave="handlePaneDragLeave"
    @drop="handlePaneDrop"
  >
    <TabBar
      :tabs="pane.tabs"
      :active-tab-id="pane.activeTabId"
      :pane-id="pane.id"
      @switch-tab="handleSwitchTab"
      @close-tab="handleCloseTab"
      @drop-tab="handleDropTab"
    />
    <Editor
      ref="editorRef"
      :model-value="editorContent"
      @update:model-value="handleContentUpdate"
      @update:has-changes="handleChangesUpdate"
      @link-click="handleLinkClick"
    />
  </div>
</template>

<style scoped>
.editor-pane {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: #f8fafc;
  border: 2px solid transparent;
  transition: border-color 0.15s ease;
}

.editor-pane.active {
  border-color: #3b82f6;
}

.editor-pane:not(.active) {
  opacity: 0.95;
}

.editor-pane.drag-over {
  border-color: #10b981;
  background: #ecfdf5;
}

@media print {
  .editor-pane {
    border: none !important;
  }
}
</style>
