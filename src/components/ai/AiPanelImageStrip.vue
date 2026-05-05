<script setup lang="ts">
import type { PendingImage } from '../../composables/useAiPendingImages';

defineProps<{
  images: PendingImage[];
}>();

defineEmits<{
  preview: [img: PendingImage];
  remove: [id: string];
  clear: [];
}>();
</script>

<template>
  <div v-if="images.length > 0" class="ai-panel__images">
    <div class="ai-panel__images-head">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
      <span class="ai-panel__images-label">
        {{ images.length }} image{{ images.length === 1 ? '' : 's' }} attached
      </span>
      <button class="ai-panel__pinned-action ai-panel__pinned-action--clear" @click="$emit('clear')" title="Remove all">Clear</button>
    </div>
    <ul class="ai-panel__images-list">
      <li v-for="img in images" :key="img.id" class="ai-panel__image-thumb">
        <button class="ai-panel__image-thumb-btn" @click="$emit('preview', img)" :title="`${img.name} — click to preview`">
          <img :src="img.blobUrl" :alt="img.name" />
        </button>
        <button class="ai-panel__image-rm" @click="$emit('remove', img.id)" title="Remove this image">×</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.ai-panel__images {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  margin-bottom: 6px;
  background: var(--bg-tertiary);
  border: 1px dashed var(--border-primary);
  border-radius: 6px;
}
.ai-panel__images-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-muted);
}
.ai-panel__images-label { font-weight: 600; flex: 1; }
.ai-panel__images-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ai-panel__image-thumb {
  position: relative;
  width: 64px;
  height: 64px;
  flex: 0 0 auto;
}
.ai-panel__image-thumb-btn {
  width: 100%;
  height: 100%;
  padding: 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-primary);
  border-radius: 4px;
  cursor: pointer;
  overflow: hidden;
  display: flex;
}
.ai-panel__image-thumb-btn:hover { border-color: var(--primary); }
.ai-panel__image-thumb-btn > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.ai-panel__image-rm {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1px solid var(--border-primary);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.ai-panel__image-rm:hover {
  background: var(--error-bg, #fee);
  color: var(--error-color, #c00);
  border-color: var(--error-color, #c00);
}
.ai-panel__pinned-action {
  padding: 2px 10px;
  font-size: 11px;
  background: var(--primary);
  color: #fff;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  margin-left: auto;
}
.ai-panel__pinned-action:hover { filter: brightness(1.1); }
.ai-panel__pinned-action--clear {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
}
.ai-panel__pinned-action--clear:hover {
  background: var(--danger);
  color: #fff;
  filter: none;
}
</style>
