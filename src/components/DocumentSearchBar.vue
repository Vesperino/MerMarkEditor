<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { useI18n } from '../i18n';

const { t } = useI18n();

const props = defineProps<{
  query: string;
  activeIndex: number;
  total: number;
}>();

const emit = defineEmits<{
  'update:query': [value: string];
  next: [];
  previous: [];
  close: [];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

const displayCount = computed(() => {
  if (!props.query || props.total === 0 || props.activeIndex < 0) return '0/0';
  return `${props.activeIndex + 1}/${props.total}`;
});

const hasMatches = computed(() => props.total > 0);

const focusInput = async () => {
  await nextTick();
  inputRef.value?.focus();
  inputRef.value?.select();
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (event.shiftKey) {
      emit('previous');
    } else {
      emit('next');
    }
    return;
  }

  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
};

defineExpose({ focusInput });
</script>

<template>
  <div class="document-search-bar" role="search">
    <input
      ref="inputRef"
      class="document-search-input"
      type="search"
      :value="query"
      :placeholder="t.documentSearchPlaceholder"
      :aria-label="t.documentSearch"
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
      @keydown="onKeydown"
    />
    <span class="document-search-count" :class="{ empty: !hasMatches }">{{ displayCount }}</span>
    <button
      class="document-search-btn"
      type="button"
      :title="t.documentSearchPrevious"
      :aria-label="t.documentSearchPrevious"
      :disabled="!hasMatches"
      @click="emit('previous')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m18 15-6-6-6 6"/>
      </svg>
    </button>
    <button
      class="document-search-btn"
      type="button"
      :title="t.documentSearchNext"
      :aria-label="t.documentSearchNext"
      :disabled="!hasMatches"
      @click="emit('next')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m6 9 6 6 6-6"/>
      </svg>
    </button>
    <button
      class="document-search-btn"
      type="button"
      :title="t.documentSearchClose"
      :aria-label="t.documentSearchClose"
      @click="emit('close')"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 6 6 18"/>
        <path d="m6 6 12 12"/>
      </svg>
    </button>
  </div>
</template>

<style scoped>
.document-search-bar {
  position: fixed;
  top: 58px;
  right: 18px;
  z-index: 9000;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  box-shadow: var(--shadow-dropdown);
}

.document-search-input {
  width: min(280px, 42vw);
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.document-search-input:focus {
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 2px var(--focus-ring-alpha);
}

.document-search-count {
  min-width: 42px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
  user-select: none;
}

.document-search-count.empty {
  color: var(--text-muted);
}

.document-search-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}

.document-search-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.document-search-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
