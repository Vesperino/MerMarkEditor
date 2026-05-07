<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';

/**
 * Reusable styled prompt for short single-line inputs (new file name,
 * rename, etc.). Replaces native `window.prompt()` calls so the UI stays
 * consistent across light/dark/minimal themes.
 *
 * Mounted at the app root via `v-if`; emits `confirm(value)` or `cancel`
 * and is dismissed by the parent toggling the `v-if`. The component
 * keeps no global state — input value is a local ref seeded from
 * `initialValue`.
 */

const props = defineProps<{
  /** Modal title (e.g. "New file"). */
  title: string;
  /** Optional helper text under the title. */
  message?: string;
  /** Label for the input field. */
  label: string;
  /** Initial value placed in the input. */
  initialValue?: string;
  /** Placeholder text when input is empty. */
  placeholder?: string;
  /** Confirm button label (defaults to "OK"). */
  confirmLabel?: string;
  /** Cancel button label (defaults to "Cancel"). */
  cancelLabel?: string;
  /**
   * Synchronous validator. Return null/empty when valid, or an error message
   * to show under the input. Empty input is always blocked unless
   * `allowEmpty` is true.
   */
  validate?: (value: string) => string | null;
  allowEmpty?: boolean;
  /** When true, pre-selects the basename portion (before the last `.`). */
  selectBasename?: boolean;
}>();

const emit = defineEmits<{
  (e: 'confirm', value: string): void;
  (e: 'cancel'): void;
}>();

const value = ref(props.initialValue ?? '');
const error = ref<string | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);

function localValidate(v: string): string | null {
  if (!props.allowEmpty && !v.trim()) return null; // suppressed; just disable button
  if (props.validate) return props.validate(v);
  return null;
}

watch(value, (v) => {
  error.value = localValidate(v);
});

const isValid = () => {
  if (!props.allowEmpty && !value.value.trim()) return false;
  return localValidate(value.value) === null;
};

function onConfirm() {
  if (!isValid()) return;
  emit('confirm', value.value);
}

function onCancel() {
  emit('cancel');
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    onCancel();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    onConfirm();
  }
}

onMounted(async () => {
  await nextTick();
  const input = inputRef.value;
  if (!input) return;
  input.focus();
  if (props.selectBasename) {
    const v = value.value;
    const lastDot = v.lastIndexOf('.');
    if (lastDot > 0) {
      input.setSelectionRange(0, lastDot);
    } else {
      input.select();
    }
  } else {
    input.select();
  }
});

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) onCancel();
}
</script>

<template>
  <Teleport to="body">
    <div class="wid-backdrop" @mousedown="onBackdropClick">
      <div class="wid-panel" role="dialog" aria-modal="true" @keydown="onKeydown">
        <header class="wid-header">
          <h3 class="wid-title">{{ title }}</h3>
        </header>

        <div class="wid-body">
          <p v-if="message" class="wid-message">{{ message }}</p>
          <label class="wid-label" :for="`wid-input`">{{ label }}</label>
          <input
            id="wid-input"
            ref="inputRef"
            v-model="value"
            type="text"
            class="wid-input"
            :class="{ 'has-error': !!error }"
            :placeholder="placeholder ?? ''"
            autocomplete="off"
            spellcheck="false"
          />
          <p v-if="error" class="wid-error">{{ error }}</p>
        </div>

        <footer class="wid-actions">
          <button class="wid-btn wid-btn-ghost" @click="onCancel">
            {{ cancelLabel ?? 'Cancel' }}
          </button>
          <button
            class="wid-btn wid-btn-primary"
            :disabled="!isValid()"
            @click="onConfirm"
          >
            {{ confirmLabel ?? 'OK' }}
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.wid-backdrop {
  position: fixed;
  inset: 0;
  z-index: 11000;
  background: var(--overlay-bg);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 18vh;
}

.wid-panel {
  width: min(440px, 92vw);
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wid-header {
  padding: 14px 18px 8px;
}

.wid-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.01em;
}

.wid-body {
  padding: 4px 18px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.wid-message {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
}

.wid-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.wid-input {
  padding: 8px 10px;
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  font-family: var(--code-font-family, monospace);
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

.wid-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--focus-ring-alpha);
}

.wid-input.has-error {
  border-color: var(--danger);
}

.wid-input.has-error:focus {
  box-shadow: 0 0 0 3px rgba(244, 63, 94, 0.18);
}

.wid-error {
  margin: 0;
  font-size: 11px;
  color: var(--danger);
}

.wid-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  background: var(--dialog-actions-bg);
  border-top: 1px solid var(--border-primary);
}

.wid-btn {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.12s ease, color 0.12s ease;
}

.wid-btn-ghost {
  background: transparent;
  border-color: var(--border-secondary);
  color: var(--text-secondary);
}

.wid-btn-ghost:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.wid-btn-primary {
  background: var(--primary);
  color: white;
}

.wid-btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.wid-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
