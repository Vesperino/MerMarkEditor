<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useI18n } from '../i18n';
import { useZoomPan } from '../composables/useZoomPan';

const { t } = useI18n();

const props = defineProps<{
  src: string;
  alt?: string;
}>();

const emit = defineEmits<{
  close: [];
}>();

const viewportRef = ref<HTMLElement | null>(null);

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

const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('close');
  }
};

onMounted(() => {
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  document.body.style.overflow = '';
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <div class="image-preview-overlay" @click.self="emit('close')">
      <div class="image-preview-toolbar">
        <button @click="zoomOut" :title="t.zoomOut">−</button>
        <span class="zoom-level">{{ zoomPercent }}%</span>
        <button @click="zoomIn" :title="t.zoomIn">+</button>
        <button @click="resetZoom" title="Reset">1:1</button>
        <button class="close-btn" @click="emit('close')" :title="t.close">✕</button>
      </div>
      <div
        class="image-preview-viewport"
        ref="viewportRef"
        @wheel="handleWheel"
        @mousedown="startPan"
        @mousemove="doPan"
        @mouseup="endPan"
        @mouseleave="endPan"
      >
        <img
          :src="props.src"
          :alt="props.alt || ''"
          :style="transformStyle"
          draggable="false"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.image-preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.image-preview-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(30, 30, 30, 0.9);
  border-radius: 0 0 8px 8px;
  user-select: none;
}

.image-preview-toolbar button {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  color: #fff;
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
  background: rgba(255, 255, 255, 0.25);
}

.image-preview-toolbar .close-btn {
  margin-left: 16px;
  background: rgba(220, 50, 50, 0.5);
}

.image-preview-toolbar .close-btn:hover {
  background: rgba(220, 50, 50, 0.8);
}

.zoom-level {
  color: #fff;
  font-size: 13px;
  min-width: 48px;
  text-align: center;
}

.image-preview-viewport {
  flex: 1;
  width: 100%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-preview-viewport img {
  max-width: 90%;
  max-height: 90vh;
  object-fit: contain;
  user-select: none;
}
</style>
