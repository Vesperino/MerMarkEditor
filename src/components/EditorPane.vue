<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import type { Pane } from '../types/pane';
import TabBar from './TabBar.vue';
import Editor from './Editor.vue';

const props = defineProps<{
  pane: Pane;
  isActive: boolean;
}>();

const emit = defineEmits<{
  switchTab: [tabId: string];
  closeTab: [tabId: string];
  updateContent: [tabId: string, content: string];
  updateChanges: [tabId: string, hasChanges: boolean];
  linkClick: [href: string];
  focus: [];
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
    :class="{ active: isActive }"
    @mousedown="handlePaneFocus"
    @focusin="handlePaneFocus"
  >
    <TabBar
      :tabs="pane.tabs"
      :active-tab-id="pane.activeTabId"
      @switch-tab="handleSwitchTab"
      @close-tab="handleCloseTab"
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

@media print {
  .editor-pane {
    border: none !important;
  }
}
</style>
