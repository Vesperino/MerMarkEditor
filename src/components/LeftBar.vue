<script setup lang="ts">
import { useLayoutConfig } from '../composables/useLayoutConfig';
import { useToolbarActions } from '../composables/useToolbarActions';
import ToolbarItemRenderer from './ToolbarItemRenderer.vue';

const { itemsForZone } = useLayoutConfig();
const { closeDropdowns } = useToolbarActions();

const leftBarItems = itemsForZone('leftbar');

const props = defineProps<{
  codeView?: boolean;
  isSplitActive?: boolean;
  diffActive?: boolean;
  canShowDiff?: boolean;
  canCompareTabs?: boolean;
  tocActive?: boolean;
}>();

const emit = defineEmits<{
  newFile: [];
  openFile: [];
  openRecent: [filePath: string];
  saveFile: [];
  saveFileAs: [];
  exportPdf: [];
  toggleCodeView: [];
  toggleSplit: [];
  toggleDiffPreview: [];
  compareTabs: [];
  showShortcuts: [];
  showSettings: [];
  toggleToc: [];
}>();
</script>

<template>
  <div class="left-bar" @click.self="closeDropdowns">
    <template v-for="item in leftBarItems" :key="item.id">
      <ToolbarItemRenderer
        :item-id="item.id"
        vertical
        :code-view="props.codeView"
        :is-split-active="props.isSplitActive"
        :diff-active="props.diffActive"
        :can-show-diff="props.canShowDiff"
        :can-compare-tabs="props.canCompareTabs"
        :toc-active="props.tocActive"
        dropdown-direction="right"
        @new-file="emit('newFile')"
        @open-file="emit('openFile')"
        @open-recent="(fp: string) => emit('openRecent', fp)"
        @save-file="emit('saveFile')"
        @save-file-as="emit('saveFileAs')"
        @export-pdf="emit('exportPdf')"
        @toggle-code-view="emit('toggleCodeView')"
        @toggle-split="emit('toggleSplit')"
        @toggle-diff-preview="emit('toggleDiffPreview')"
        @compare-tabs="emit('compareTabs')"
        @show-shortcuts="emit('showShortcuts')"
        @show-settings="emit('showSettings')"
        @toggle-toc="emit('toggleToc')"
      />
    </template>
  </div>
</template>

<style scoped>
.left-bar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 40px;
  padding: 8px 4px;
  background: var(--leftbar-bg, var(--toolbar-gradient-to));
  border-right: 1px solid var(--border-primary);
  user-select: none;
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
