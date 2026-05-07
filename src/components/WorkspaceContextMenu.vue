<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../i18n';

export type WorkspaceContextAction = 'new-file' | 'rename' | 'delete' | 'reveal';

const { t } = useI18n();

const props = defineProps<{
  x: number;
  y: number;
  /** 'file' rows offer rename/delete/reveal; 'folder' rows additionally show 'New file…'. */
  kind: 'file' | 'folder';
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'action', action: WorkspaceContextAction): void;
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
    if (props.x + rect.width > vw) {
      adjustedX.value = vw - rect.width - 8;
    }
    if (props.y + rect.height > vh) {
      adjustedY.value = vh - rect.height - 8;
    }
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

const handle = (action: WorkspaceContextAction) => {
  emit('action', action);
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuRef"
      class="workspace-context-menu"
      :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
    >
      <button
        v-if="kind === 'folder'"
        class="context-menu-item"
        @click="handle('new-file')"
      >
        {{ t.workspaceContextNewFile }}
      </button>
      <button class="context-menu-item" @click="handle('rename')">
        {{ t.workspaceContextRename }}
      </button>
      <button class="context-menu-item" @click="handle('reveal')">
        {{ t.workspaceContextRevealInOs }}
      </button>
      <div class="context-menu-divider"></div>
      <button class="context-menu-item danger" @click="handle('delete')">
        {{ t.workspaceContextDelete }}
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.workspace-context-menu {
  position: fixed;
  z-index: 10000;
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 4px;
  min-width: 200px;
  box-shadow: var(--shadow-dropdown);
}

.context-menu-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  text-align: left;
  border: none;
  background: none;
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s;
}

.context-menu-item:hover {
  background: var(--hover-bg);
}

.context-menu-item.danger {
  color: var(--danger);
}

.context-menu-item.danger:hover {
  background: var(--danger-text-bg);
}

.context-menu-divider {
  height: 1px;
  background: var(--border-primary);
  margin: 4px 0;
}
</style>
