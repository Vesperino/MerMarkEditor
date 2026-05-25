<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../i18n';
import { SORT_MODES, type WorkspaceSortMode } from '../utils/workspace-sort';

/**
 * Small dropdown listing the available sort modes with the current one
 * checked. Reused for the global sort (header), per-workspace sort (section
 * header) and per-folder sort (context menu). Pure presentation — the parent
 * owns persistence and decides whether to show the "inherit/default" row.
 */
const { t } = useI18n();

const props = defineProps<{
  x: number;
  y: number;
  /** Currently effective mode, shown with a check. */
  current: WorkspaceSortMode;
  /** When set, an "inherit/default" row is offered that emits null. */
  allowInherit?: boolean;
  /** True when an override is currently active (drives the inherit row's check). */
  hasOverride?: boolean;
}>();

const emit = defineEmits<{
  (e: 'select', mode: WorkspaceSortMode | null): void;
  (e: 'close'): void;
}>();

const menuRef = ref<HTMLDivElement | null>(null);
const adjustedX = ref(props.x);
const adjustedY = ref(props.y);

function labelFor(mode: WorkspaceSortMode): string {
  switch (mode) {
    case 'name-asc': return t.value.sortNameAsc;
    case 'name-desc': return t.value.sortNameDesc;
    case 'modified-desc': return t.value.sortModifiedDesc;
    case 'modified-asc': return t.value.sortModifiedAsc;
  }
}

function pick(mode: WorkspaceSortMode | null) {
  emit('select', mode);
  emit('close');
}

const onDocMouseDown = (e: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) emit('close');
};
const onEscape = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close');
};

onMounted(() => {
  const menu = menuRef.value;
  if (menu) {
    const rect = menu.getBoundingClientRect();
    if (props.x + rect.width > window.innerWidth) adjustedX.value = window.innerWidth - rect.width - 8;
    if (props.y + rect.height > window.innerHeight) adjustedY.value = window.innerHeight - rect.height - 8;
  }
  setTimeout(() => {
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onEscape);
  }, 0);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', onDocMouseDown);
  document.removeEventListener('keydown', onEscape);
});
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuRef"
      class="sort-menu"
      :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
    >
      <button
        v-if="allowInherit"
        class="sort-menu-item"
        @click="pick(null)"
      >
        <span class="sort-menu-check">{{ !hasOverride ? '✓' : '' }}</span>
        {{ t.sortInherit }}
      </button>
      <div v-if="allowInherit" class="sort-menu-divider"></div>
      <button
        v-for="mode in SORT_MODES"
        :key="mode"
        class="sort-menu-item"
        @click="pick(mode)"
      >
        <span class="sort-menu-check">{{ (hasOverride || !allowInherit) && current === mode ? '✓' : '' }}</span>
        {{ labelFor(mode) }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.sort-menu {
  position: fixed;
  z-index: 10000;
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 4px;
  min-width: 200px;
  box-shadow: var(--shadow-dropdown);
}

.sort-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 10px;
  font-size: 13px;
  text-align: left;
  border: none;
  background: none;
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
}

.sort-menu-item:hover {
  background: var(--hover-bg);
}

.sort-menu-check {
  display: inline-block;
  width: 12px;
  color: var(--primary);
  flex-shrink: 0;
}

.sort-menu-divider {
  height: 1px;
  background: var(--border-primary);
  margin: 4px 0;
}
</style>
