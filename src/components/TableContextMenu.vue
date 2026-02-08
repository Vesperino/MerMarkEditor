<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../i18n';

const { t } = useI18n();

const props = defineProps<{
  x: number;
  y: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'action', action: string): void;
}>();

const menuRef = ref<HTMLDivElement | null>(null);
const adjustedX = ref(props.x);
const adjustedY = ref(props.y);

const handleClickOutside = (event: MouseEvent) => {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit('close');
  }
};

onMounted(() => {
  // Adjust position to keep menu within viewport
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
  }, 0);
});

onUnmounted(() => {
  document.removeEventListener('mousedown', handleClickOutside);
});

const actions = [
  { key: 'addRowBefore', divider: false },
  { key: 'addRowAfter', divider: false },
  { key: 'addColumnBefore', divider: false },
  { key: 'addColumnAfter', divider: true },
  { key: 'deleteRow', divider: false, danger: true },
  { key: 'deleteColumn', divider: false, danger: true },
  { key: 'deleteTable', divider: false, danger: true },
];

const getLabel = (key: string) => {
  const map: Record<string, () => string> = {
    addRowBefore: () => t.value.addRowAbove,
    addRowAfter: () => t.value.addRowBelow,
    addColumnBefore: () => t.value.addColumnBefore,
    addColumnAfter: () => t.value.addColumnAfter,
    deleteRow: () => t.value.deleteRow,
    deleteColumn: () => t.value.deleteColumn,
    deleteTable: () => t.value.deleteTable,
  };
  return map[key]?.() || key;
};

const handleAction = (key: string) => {
  emit('action', key);
  emit('close');
};
</script>

<template>
  <Teleport to="body">
    <div
      ref="menuRef"
      class="table-context-menu"
      :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
    >
      <template v-for="(action, index) in actions" :key="action.key">
        <div
          v-if="action.divider && index > 0"
          class="context-menu-divider"
        ></div>
        <button
          class="context-menu-item"
          :class="{ danger: action.danger }"
          @click="handleAction(action.key)"
        >
          {{ getLabel(action.key) }}
        </button>
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.table-context-menu {
  position: fixed;
  z-index: 10000;
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  padding: 4px;
  min-width: 180px;
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
