<script setup lang="ts">
import { useLayoutConfig } from '../composables/useLayoutConfig';
import { useToolbarActions } from '../composables/useToolbarActions';
import ToolbarItemRenderer from './ToolbarItemRenderer.vue';
import AiStatusbarIndicator from './ai/AiStatusbarIndicator.vue';

const { itemsForZone } = useLayoutConfig();
const { closeDropdowns } = useToolbarActions();

const statusBarItems = itemsForZone('statusbar');

const props = defineProps<{
  codeView?: boolean;
  isSplitActive?: boolean;
  splitEditorActive?: boolean;
  diffActive?: boolean;
  canShowDiff?: boolean;
  canCompareTabs?: boolean;
  tocActive?: boolean;
  aiActive?: boolean;
}>();

const emit = defineEmits<{
  newFile: [];
  openFile: [];
  openRecent: [filePath: string];
  openWorkspace: [];
  openRecentWorkspace: [rootPath: string];
  saveFile: [];
  saveFileAs: [];
  exportPdf: [];
  exportDocx: [];
  presentMarp: [];
  toggleCodeView: [];
  toggleSplit: [];
  toggleSplitEditor: [];
  toggleDiffPreview: [];
  compareTabs: [];
  showShortcuts: [];
  showSettings: [];
  toggleToc: [];
  toggleAi: [];
}>();
</script>

<template>
  <div class="status-bar" @click.self="closeDropdowns">
    <template v-for="item in statusBarItems" :key="item.id">
      <ToolbarItemRenderer
        :item-id="item.id"
        compact
        :code-view="props.codeView"
        :is-split-active="props.isSplitActive"
        :split-editor-active="props.splitEditorActive"
        :diff-active="props.diffActive"
        :can-show-diff="props.canShowDiff"
        :can-compare-tabs="props.canCompareTabs"
        :toc-active="props.tocActive"
        :ai-active="props.aiActive"
        dropdown-direction="up"
        @new-file="emit('newFile')"
        @open-file="emit('openFile')"
        @open-recent="(fp: string) => emit('openRecent', fp)"
        @open-workspace="emit('openWorkspace')"
        @open-recent-workspace="(rp: string) => emit('openRecentWorkspace', rp)"
        @save-file="emit('saveFile')"
        @save-file-as="emit('saveFileAs')"
        @export-pdf="emit('exportPdf')"
        @export-docx="emit('exportDocx')"
        @present-marp="emit('presentMarp')"
        @toggle-code-view="emit('toggleCodeView')"
        @toggle-split="emit('toggleSplit')"
        @toggle-split-editor="emit('toggleSplitEditor')"
        @toggle-diff-preview="emit('toggleDiffPreview')"
        @compare-tabs="emit('compareTabs')"
        @show-shortcuts="emit('showShortcuts')"
        @show-settings="emit('showSettings')"
        @toggle-toc="emit('toggleToc')"
        @toggle-ai="emit('toggleAi')"
      />
    </template>
    <AiStatusbarIndicator />
  </div>
</template>

<style scoped>
.status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 12px;
  background: var(--statusbar-bg, var(--toolbar-gradient-to));
  border-top: 1px solid var(--border-primary);
  font-size: 12px;
  user-select: none;
  flex-shrink: 0;
}
</style>
