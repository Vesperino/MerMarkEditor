<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { getVersion } from '@tauri-apps/api/app';
import { markdownToHtml } from '../utils/markdown-converter';
import { useI18n } from '../i18n';

const { t } = useI18n();

const emit = defineEmits<{
  close: [];
}>();

const appVersion = ref('');
const markdownContent = ref('');
const isLoading = ref(true);
const hasError = ref(false);

const CACHE_KEY = 'mermark-whats-new';
const GITHUB_REPO = 'Vesperino/MerMarkEditor';

const renderedHtml = computed(() => {
  if (!markdownContent.value) return '';
  return markdownToHtml(markdownContent.value);
});

const loadChangelog = async () => {
  try {
    const version = await getVersion();
    appVersion.value = version;

    // Check cache first
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.version === version && parsed.content) {
          markdownContent.value = parsed.content;
          isLoading.value = false;
          return;
        }
      }
    } catch {
      // ignore cache errors
    }

    // Fetch from GitHub releases API
    const tagName = `v${version}`;
    const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${tagName}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (response.ok) {
      const data = await response.json() as { body?: string };
      const body = data.body || '';
      markdownContent.value = body;

      // Cache it
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ version, content: body }));
      } catch {
        // ignore storage errors
      }
    } else {
      hasError.value = true;
    }
  } catch {
    hasError.value = true;
  } finally {
    isLoading.value = false;
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('close');
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  loadChangelog();
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
        <div v-if="isLoading" class="whats-new-loading">
          {{ t.loadingChangelog }}
        </div>
        <div v-else-if="hasError" class="whats-new-error">
          {{ t.changelogError }}
        </div>
        <div v-else class="whats-new-content" v-html="renderedHtml"></div>
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

.whats-new-loading,
.whats-new-error {
  color: var(--text-muted);
  font-size: 14px;
  text-align: center;
  padding: 32px 0;
}

.whats-new-error {
  color: var(--error-color);
}
</style>

<style>
/* Unscoped styles for rendered markdown content */
.whats-new-content {
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.whats-new-content h1,
.whats-new-content h2,
.whats-new-content h3 {
  color: var(--text-primary);
  margin: 1.2em 0 0.5em;
  font-weight: 600;
}

.whats-new-content h1:first-child,
.whats-new-content h2:first-child,
.whats-new-content h3:first-child {
  margin-top: 0;
}

.whats-new-content h1 { font-size: 1.4em; }
.whats-new-content h2 { font-size: 1.2em; }
.whats-new-content h3 { font-size: 1.05em; }

.whats-new-content p {
  margin: 0.6em 0;
}

.whats-new-content ul,
.whats-new-content ol {
  margin: 0.6em 0;
  padding-left: 1.5em;
}

.whats-new-content li {
  margin: 0.3em 0;
}

.whats-new-content code {
  background: var(--code-inline-bg, rgba(0,0,0,0.1));
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 0.9em;
}

.whats-new-content pre {
  background: var(--code-block-bg);
  padding: 12px 16px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0.8em 0;
}

.whats-new-content pre code {
  background: none;
  padding: 0;
}

.whats-new-content img {
  max-width: 100%;
  border-radius: 8px;
  margin: 0.8em 0;
  border: 1px solid var(--border-primary);
}

.whats-new-content a {
  color: var(--primary);
  text-decoration: none;
}

.whats-new-content a:hover {
  text-decoration: underline;
}

.whats-new-content blockquote {
  border-left: 3px solid var(--primary);
  margin: 0.8em 0;
  padding: 0.5em 1em;
  color: var(--text-muted);
  background: var(--bg-secondary);
  border-radius: 0 6px 6px 0;
}

.whats-new-content hr {
  border: none;
  border-top: 1px solid var(--border-primary);
  margin: 1em 0;
}
</style>
