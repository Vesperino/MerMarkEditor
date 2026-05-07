<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

/**
 * Styled confirmation dialog (replaces `window.confirm`). Use for
 * destructive actions — set `danger` to render the confirm button in the
 * danger color.
 */

defineProps<{
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('cancel');
  } else if (e.key === 'Enter') {
    e.preventDefault();
    emit('confirm');
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown));
onUnmounted(() => document.removeEventListener('keydown', onKeydown));

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('cancel');
}
</script>

<template>
  <Teleport to="body">
    <div class="wcd-backdrop" @mousedown="onBackdropClick">
      <div class="wcd-panel" role="alertdialog" aria-modal="true">
        <header class="wcd-header">
          <h3 class="wcd-title">{{ title }}</h3>
        </header>
        <div class="wcd-body">
          <p class="wcd-message">{{ message }}</p>
        </div>
        <footer class="wcd-actions">
          <button class="wcd-btn wcd-btn-ghost" @click="emit('cancel')">
            {{ cancelLabel ?? 'Cancel' }}
          </button>
          <button
            class="wcd-btn"
            :class="danger ? 'wcd-btn-danger' : 'wcd-btn-primary'"
            @click="emit('confirm')"
          >
            {{ confirmLabel ?? 'OK' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.wcd-backdrop {
  position: fixed;
  inset: 0;
  z-index: 11000;
  background: var(--overlay-bg);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 22vh;
}

.wcd-panel {
  width: min(420px, 92vw);
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wcd-header {
  padding: 14px 18px 4px;
}

.wcd-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.wcd-body {
  padding: 4px 18px 18px;
}

.wcd-message {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.wcd-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  background: var(--dialog-actions-bg);
  border-top: 1px solid var(--border-primary);
}

.wcd-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.12s ease;
}

.wcd-btn-ghost {
  background: transparent;
  border-color: var(--border-secondary);
  color: var(--text-secondary);
}

.wcd-btn-ghost:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.wcd-btn-primary {
  background: var(--primary);
  color: white;
}

.wcd-btn-primary:hover {
  background: var(--primary-hover);
}

.wcd-btn-danger {
  background: var(--danger);
  color: white;
}

.wcd-btn-danger:hover {
  background: var(--danger-light);
}
</style>
