<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../i18n';
import { useZoomPan } from '../composables/useZoomPan';
import { fileToBlobUrl } from '../utils/image-resolver';

const { t } = useI18n();

const props = defineProps<{
  src: string;
  alt?: string;
  localFile?: boolean;
  inPane?: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const imageUrl = ref('');
const loadFailed = ref(false);

const {
  zoomPercent,
  transformStyle,
  zoomIn,
  zoomOut,
  resetZoom,
  startPan,
  doPan,
  endPan,
  handleWheel,
} = useZoomPan();

watch(
  [() => props.src, () => props.localFile],
  async ([src, localFile], _previous, onCleanup) => {
    endPan();
    resetZoom();
    loadFailed.value = !src;
    imageUrl.value = localFile ? '' : src;
    if (!localFile || !src) return;

    let closed = false;
    let blobUrl = '';
    onCleanup(() => {
      closed = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    });
    try {
      blobUrl = await fileToBlobUrl(src);
      if (closed) URL.revokeObjectURL(blobUrl);
      else imageUrl.value = blobUrl;
    } catch {
      if (!closed) loadFailed.value = true;
    }
  },
  { immediate: true },
);

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('close');
  }
};

onMounted(() => {
  if (props.inPane) return;
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  if (props.inPane) return;
  document.body.style.overflow = '';
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body" :disabled="props.inPane">
    <div
      :class="props.inPane ? 'image-preview-pane' : 'image-preview-overlay'"
      @click.self="!props.inPane && emit('close')"
    >
      <div class="image-preview-toolbar">
        <button type="button" @click="zoomOut" :title="t.zoomOut" :aria-label="t.zoomOut">−</button>
        <span class="zoom-level">{{ zoomPercent }}%</span>
        <button type="button" @click="zoomIn" :title="t.zoomIn" :aria-label="t.zoomIn">+</button>
        <button type="button" @click="resetZoom" :title="t.resetZoom" :aria-label="t.resetZoom">1:1</button>
        <button v-if="!props.inPane" type="button" class="close-btn" @click="emit('close')" :title="t.close" :aria-label="t.close">✕</button>
      </div>
      <div
        class="image-preview-viewport"
        @wheel.stop="handleWheel"
        @mousedown.left="startPan"
        @mousemove="doPan"
        @mouseup="endPan"
        @mouseleave="endPan"
      >
        <span v-if="loadFailed" role="status" class="preview-error">{{ t.imageLoadError }}</span>
        <img
          v-else-if="imageUrl"
          :key="imageUrl"
          :src="imageUrl"
          :alt="props.alt || ''"
          :style="transformStyle"
          draggable="false"
          @error="loadFailed = true"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.image-preview-overlay,
.image-preview-pane {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.image-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
}

.image-preview-pane {
  flex: 1;
  min-height: 0;
  background: var(--editor-container-bg);
  color: var(--text-primary);
  --preview-toolbar-bg: var(--bg-secondary);
  --preview-button-bg: var(--bg-primary);
  --preview-button-hover-bg: var(--hover-bg);
}

.image-preview-toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--preview-toolbar-bg, rgba(30, 30, 30, 0.9));
  border-radius: 0 0 8px 8px;
  user-select: none;
}

.image-preview-pane .image-preview-toolbar {
  width: 100%;
  justify-content: center;
  border-bottom: 1px solid var(--border-primary);
  border-radius: 0;
}

.image-preview-toolbar button {
  background: var(--preview-button-bg, rgba(255, 255, 255, 0.15));
  border: none;
  color: inherit;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview-toolbar button:hover {
  background: var(--preview-button-hover-bg, rgba(255, 255, 255, 0.25));
}

.image-preview-toolbar .close-btn {
  margin-left: 16px;
  background: rgba(220, 50, 50, 0.5);
}

.image-preview-toolbar .close-btn:hover {
  background: rgba(220, 50, 50, 0.8);
}

.zoom-level {
  font-size: 13px;
  min-width: 48px;
  text-align: center;
}

.image-preview-viewport {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview-viewport img {
  max-width: 90%;
  max-height: 90%;
  object-fit: contain;
  user-select: none;
}
</style>
