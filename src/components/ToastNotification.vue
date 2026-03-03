<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { TIMING } from '../constants';

const props = withDefaults(defineProps<{
  message: string;
  type?: 'info' | 'success' | 'warning';
  duration?: number;
}>(), {
  type: 'info',
  duration: TIMING.TOAST_DURATION,
});

const emit = defineEmits<{
  close: [];
}>();

let timer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  timer = setTimeout(() => {
    emit('close');
  }, props.duration);
});

onUnmounted(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <div class="toast-container">
    <div class="toast" :class="'toast--' + type">
      <div class="toast-accent"></div>
      <div class="toast-content">
        <svg v-if="type === 'info'" class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="16" x2="12" y2="12"/>
          <line x1="12" y1="8" x2="12.01" y2="8"/>
        </svg>
        <svg v-else-if="type === 'success'" class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        <svg v-else class="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span class="toast-message">{{ message }}</span>
      </div>
      <button class="toast-close" @click="emit('close')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9998;
  animation: toast-slide-in 0.3s ease-out;
}

@keyframes toast-slide-in {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.toast {
  display: flex;
  align-items: stretch;
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: var(--shadow-dropdown);
  overflow: hidden;
  max-width: 360px;
  min-width: 240px;
}

.toast-accent {
  width: 4px;
  flex-shrink: 0;
}

.toast--info .toast-accent {
  background: var(--primary);
}

.toast--info .toast-icon {
  color: var(--primary);
}

.toast--success .toast-accent {
  background: var(--success);
}

.toast--success .toast-icon {
  color: var(--success);
}

.toast--warning .toast-accent {
  background: #f59e0b;
}

.toast--warning .toast-icon {
  color: #f59e0b;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  flex: 1;
  min-width: 0;
}

.toast-icon {
  flex-shrink: 0;
}

.toast-message {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.4;
}

.toast-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  background: none;
  border: none;
  border-left: 1px solid var(--border-primary);
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.15s;
  flex-shrink: 0;
}

.toast-close:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}
</style>
