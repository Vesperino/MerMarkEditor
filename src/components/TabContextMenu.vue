<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../i18n';

/**
 * Right-click menu for editor tabs. Mounted ad-hoc by `TabBar.vue` when
 * the user contextmenus a tab; emits the picked action upward and self-
 * closes via Esc, click-outside, or any selection.
 */

export type TabContextAction =
  | 'pin'
  | 'unpin'
  | 'close'
  | 'close-others'
  | 'close-all'
  | 'close-all-but-pinned'
  | 'close-saved'
  | 'copy-path'
  | 'reveal-in-os';

const { t } = useI18n();

const props = defineProps<{
  x: number;
  y: number;
  isPinned: boolean;
  /** When true, the user clicked an unpinned tab — affects pin/unpin label. */
  hasOtherTabs: boolean;
  /** Disable copy-path / reveal when the tab has no associated file (unsaved scratch). */
  hasFilePath?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'action', action: TabContextAction): void;
}>();

const menuRef = ref<HTMLDivElement | null>(null);
const adjustedX = ref(props.x);
const adjustedY = ref(props.y);

const handleClickOutside = (event: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('close');
  }
};

const handleEscape = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close');
};

onMounted(() => {
  const menu = menuRef.value;
  if (menu) {
    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (props.x + rect.width > vw) adjustedX.value = vw - rect.width - 8;
    if (props.y + rect.height > vh) adjustedY.value = vh - rect.height - 8;
  }
  setTimeout(() => {
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
  }, 0);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
  document.removeEventListener('keydown', handleEscape);
});

const handle = (action: TabContextAction) => {
  emit('action', action);
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuRef"
      class="tab-context-menu"
      :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
    >
      <button class="ctx-item" @click="handle(isPinned ? 'unpin' : 'pin')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="17" x2="12" y2="22"/>
          <path d="M5 17h14l-1.7-3.4A2 2 0 0 1 17 12.7V7a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v5.7a2 2 0 0 1-.3 1.1z"/>
        </svg>
        <span>{{ isPinned ? t.tabUnpin : t.tabPin }}</span>
      </button>

      <div class="ctx-divider"></div>

      <button class="ctx-item" :disabled="!hasFilePath" @click="handle('copy-path')">
        {{ t.workspaceContextCopyPath }}
      </button>
      <button class="ctx-item" :disabled="!hasFilePath" @click="handle('reveal-in-os')">
        {{ t.workspaceContextRevealInOs }}
      </button>

      <div class="ctx-divider"></div>

      <button class="ctx-item" @click="handle('close')">{{ t.tabClose }}</button>
      <button class="ctx-item" :disabled="!hasOtherTabs" @click="handle('close-others')">{{ t.tabCloseOthers }}</button>
      <button class="ctx-item" :disabled="!hasOtherTabs" @click="handle('close-all-but-pinned')">{{ t.tabCloseAllButPinned }}</button>
      <button class="ctx-item" @click="handle('close-saved')">{{ t.tabCloseSaved }}</button>
      <button class="ctx-item danger" @click="handle('close-all')">{{ t.tabCloseAll }}</button>
    </div>
  </Teleport>
</template>

<style scoped>
.tab-context-menu {
  position: fixed;
  z-index: 10000;
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 4px;
  min-width: 220px;
  box-shadow: var(--shadow-dropdown);
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 12px;
  font-size: 13px;
  text-align: left;
  border: none;
  background: none;
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}

.ctx-item:hover:not(:disabled) {
  background: var(--hover-bg);
}

.ctx-item:disabled {
  color: var(--text-faint);
  cursor: not-allowed;
}

.ctx-item.danger:not(:disabled) {
  color: var(--danger);
}

.ctx-item.danger:not(:disabled):hover {
  background: var(--danger-text-bg);
}

.ctx-item svg {
  flex-shrink: 0;
  color: var(--text-muted);
}

.ctx-divider {
  height: 1px;
  background: var(--border-primary);
  margin: 4px 0;
}
</style>
