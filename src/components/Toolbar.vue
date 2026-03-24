<script setup lang="ts">
import { useLayoutConfig } from '../composables/useLayoutConfig';
import { useToolbarActions } from '../composables/useToolbarActions';
import { getItemDef } from '../data/toolbarItems';
import ToolbarItemRenderer from './ToolbarItemRenderer.vue';

const { itemsForZone } = useLayoutConfig();
const { closeDropdowns } = useToolbarActions();

const toolbarItems = itemsForZone('toolbar');

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

// Determine if a separator should be inserted before this item
const needsSeparator = (index: number) => {
  if (index === 0) return false;
  const items = toolbarItems.value;
  const prevDef = getItemDef(items[index - 1].id);
  const currDef = getItemDef(items[index].id);
  if (!prevDef || !currDef) return false;
  return prevDef.category !== currDef.category;
};

// Check if we need a spacer before this item (after editing tools, before stats/zoom/toggles)
const spacerCategories = new Set(['stats', 'zoom', 'view-toggles']);
const editingCategories = new Set(['file-ops', 'edit-history', 'headings', 'text-format', 'lists', 'blocks', 'links-media', 'table', 'mermaid']);

const needsSpacerBefore = (index: number) => {
  if (index === 0) return false;
  const items = toolbarItems.value;
  const prevDef = getItemDef(items[index - 1].id);
  const currDef = getItemDef(items[index].id);
  if (!prevDef || !currDef) return false;
  return editingCategories.has(prevDef.category) && spacerCategories.has(currDef.category);
};
</script>

<template>
  <div class="toolbar" @click.self="closeDropdowns">
    <div class="toolbar-row">
      <template v-for="(item, index) in toolbarItems" :key="item.id">
        <!-- Spacer between editing tools and right-side items -->
        <div v-if="needsSpacerBefore(index)" class="toolbar-spacer"></div>

        <!-- Separator between categories -->
        <div v-if="needsSeparator(index) && !needsSpacerBefore(index)" class="toolbar-separator"></div>

        <ToolbarItemRenderer
          :item-id="item.id"
          :code-view="props.codeView"
          :is-split-active="props.isSplitActive"
          :diff-active="props.diffActive"
          :can-show-diff="props.canShowDiff"
          :can-compare-tabs="props.canCompareTabs"
          :toc-active="props.tocActive"
          dropdown-direction="down"
          @new-file="emit('newFile')"
          @open-file="emit('openFile')"
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
  </div>
</template>

<style scoped>
.toolbar {
  background: linear-gradient(to bottom, var(--toolbar-gradient-from), var(--toolbar-gradient-to));
  border-bottom: 1px solid var(--border-primary);
  padding: 8px 16px;
  user-select: none;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.toolbar-spacer {
  flex: 1;
  min-width: 8px;
}

.toolbar-separator {
  width: 1px;
  height: 28px;
  background: var(--border-primary);
  margin: 0 8px;
}
</style>
