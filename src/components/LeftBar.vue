<script setup lang="ts">
import { useLayoutConfig } from '../composables/useLayoutConfig';
import { useToolbarActions } from '../composables/useToolbarActions';
import { useSettings } from '../composables/useSettings';
import { useI18n } from '../i18n';
import ToolbarItemRenderer from './ToolbarItemRenderer.vue';

const { itemsForZone } = useLayoutConfig();
const { closeDropdowns } = useToolbarActions();
const { settings, toggleLeftBarExpanded } = useSettings();
const { t } = useI18n();

const leftBarItems = itemsForZone('leftbar');

const props = defineProps<{
  codeView?: boolean;
  isSplitActive?: boolean;
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
  toggleCodeView: [];
  toggleSplit: [];
  toggleDiffPreview: [];
  compareTabs: [];
  showShortcuts: [];
  showSettings: [];
  toggleToc: [];
  toggleAi: [];
}>();
</script>

<template>
  <div
    class="left-bar"
    :class="{ 'left-bar--expanded': settings.leftBarExpanded }"
    @click.self="closeDropdowns"
  >
    <template v-for="item in leftBarItems" :key="item.id">
      <ToolbarItemRenderer
        :item-id="item.id"
        vertical
        :expanded="settings.leftBarExpanded"
        :code-view="props.codeView"
        :is-split-active="props.isSplitActive"
        :diff-active="props.diffActive"
        :can-show-diff="props.canShowDiff"
        :can-compare-tabs="props.canCompareTabs"
        :toc-active="props.tocActive"
        :ai-active="props.aiActive"
        dropdown-direction="right"
        @new-file="emit('newFile')"
        @open-file="emit('openFile')"
        @open-recent="(fp: string) => emit('openRecent', fp)"
        @open-workspace="emit('openWorkspace')"
        @open-recent-workspace="(rp: string) => emit('openRecentWorkspace', rp)"
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
        @toggle-ai="emit('toggleAi')"
      />
    </template>
    <button
      class="left-bar__expand-toggle"
      :title="settings.leftBarExpanded ? t.collapseSidebar : t.expandSidebar"
      :aria-label="settings.leftBarExpanded ? t.collapseSidebar : t.expandSidebar"
      @click="toggleLeftBarExpanded"
    >
      <svg
        v-if="!settings.leftBarExpanded"
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      ><polyline points="9 18 15 12 9 6"/></svg>
      <svg
        v-else
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
      ><polyline points="15 18 9 12 15 6"/></svg>
    </button>
  </div>
</template>

<style scoped>
.left-bar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: 40px;
  padding: 8px 4px;
  background: var(--leftbar-bg, var(--toolbar-gradient-to));
  border-right: 1px solid var(--border-primary);
  user-select: none;
  flex-shrink: 0;
  overflow-y: auto;
  overflow-x: hidden;
  transition: width 140ms ease;
}
.left-bar--expanded {
  width: 168px;
  align-items: stretch;
  padding: 8px 8px;
}

/* When collapsed, items keep their natural icon-only size and centre. */
.left-bar:not(.left-bar--expanded) {
  align-items: center;
}

/* Expanded: stretch buttons full width so labels have room and don't wrap. */
.left-bar--expanded :deep(.toolbar-btn),
.left-bar--expanded :deep(.ai-toolbar-btn) {
  width: 100%;
  justify-content: flex-start;
}

.left-bar__expand-toggle {
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-muted);
  cursor: pointer;
  align-self: center;
  transition: background 100ms ease, color 100ms ease, border-color 100ms ease;
}
.left-bar__expand-toggle:hover {
  background: var(--hover-bg);
  border-color: var(--border-primary);
  color: var(--text-primary);
}
.left-bar--expanded .left-bar__expand-toggle {
  align-self: flex-end;
}
</style>
