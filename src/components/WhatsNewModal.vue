<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { getVersion } from '@tauri-apps/api/app';
import { markdownToHtml } from '../utils/markdown-converter';
import { useI18n } from '../i18n';
import { getCurrent } from '../services/releaseNotes';
import '../styles/release-notes.css';

const { t } = useI18n();

const emit = defineEmits<{
  close: [];
  openChangelog: [];
}>();

const appVersion = ref('');
const markdown = ref<string | null>(null);

const renderedHtml = computed(() => (markdown.value ? markdownToHtml(markdown.value) : ''));

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close');
};

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  try {
    appVersion.value = await getVersion();
  } catch {
    appVersion.value = '';
  }
  const entry = appVersion.value ? getCurrent(appVersion.value) : null;
  markdown.value = entry?.markdown ?? null;
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="whats-new-overlay" @click.self="emit('close')">
    <div class="whats-new-panel">
      <div class="whats-new-header">
        <h3>{{ t.whatsNewIn }} v{{ appVersion }}</h3>
        <button @click="emit('close')" class="whats-new-close-btn" :title="t.close">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="whats-new-body">
        <div v-if="markdown" class="release-notes-content" v-html="renderedHtml"></div>
        <div v-else class="whats-new-empty">{{ t.noReleaseNotesForBuild }}</div>
      </div>
      <div class="whats-new-footer">
        <button class="whats-new-changelog-btn" @click="emit('openChangelog')">
          {{ t.fullChangelog }} →
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.whats-new-overlay {
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

.whats-new-panel {
  background: var(--dialog-bg);
  border-radius: 12px;
  width: 620px;
  max-width: 92%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.whats-new-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-primary);
  flex-shrink: 0;
}

.whats-new-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
  font-weight: 600;
}

.whats-new-close-btn {
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

.whats-new-close-btn:hover {
  background: var(--hover-bg);
  color: var(--text-primary);
}

.whats-new-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.whats-new-empty {
  color: var(--text-muted);
  font-size: 14px;
  text-align: center;
  padding: 32px 0;
}

.whats-new-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--border-primary);
}

.whats-new-changelog-btn {
  background: none;
  border: none;
  color: var(--primary);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.whats-new-changelog-btn:hover {
  background: var(--hover-bg);
}
</style>
