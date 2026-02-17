<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useI18n } from '../i18n';

const { t } = useI18n();

const emit = defineEmits<{
  close: [];
}>();

const shortcuts = [
  { key: 'Ctrl+N', action: () => t.value.new },
  { key: 'Ctrl+O', action: () => t.value.open },
  { key: 'Ctrl+S', action: () => t.value.save },
  { key: 'Ctrl+Shift+S', action: () => t.value.saveAs },
  { key: 'Ctrl+P', action: () => t.value.exportPdf },
  { key: 'Ctrl+Z', action: () => t.value.undo },
  { key: 'Ctrl+Y', action: () => t.value.redo },
  { key: 'Ctrl+B', action: () => t.value.bold },
  { key: 'Ctrl+I', action: () => t.value.italic },
  { key: 'Ctrl+Shift+D', action: () => t.value.changes },
  { key: 'Ctrl+Shift+C', action: () => t.value.compareTabs },
  { key: 'Ctrl+/', action: () => t.value.keyboardShortcuts },
  { key: 'Escape', action: () => t.value.close },
];

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('close');
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="shortcuts-overlay" @click.self="emit('close')">
    <div class="shortcuts-panel">
      <div class="shortcuts-header">
        <h3>{{ t.keyboardShortcuts }}</h3>
        <button @click="emit('close')" class="shortcuts-close-btn" :title="t.close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="shortcuts-content">
        <table class="shortcuts-table">
          <thead>
            <tr>
              <th>{{ t.shortcutKey }}</th>
              <th>{{ t.shortcutAction }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="shortcut in shortcuts" :key="shortcut.key">
              <td><kbd>{{ shortcut.key }}</kbd></td>
              <td>{{ shortcut.action() }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shortcuts-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.shortcuts-panel {
  background: var(--dialog-bg);
  border-radius: 12px;
  width: 480px;
  max-width: 92%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.shortcuts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.shortcuts-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 600;
}

.shortcuts-close-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.shortcuts-close-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.shortcuts-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px 20px;
}

.shortcuts-table {
  width: 100%;
  border-collapse: collapse;
}

.shortcuts-table th {
  text-align: left;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border-primary);
}

.shortcuts-table td {
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-subtle, var(--border-primary));
}

.shortcuts-table tr:last-child td {
  border-bottom: none;
}

kbd {
  display: inline-block;
  padding: 2px 8px;
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  background: var(--bg-secondary, var(--hover-bg));
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  white-space: nowrap;
}
</style>
