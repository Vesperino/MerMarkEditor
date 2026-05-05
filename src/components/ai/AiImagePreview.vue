<script setup lang="ts">
import { useI18n } from '../../i18n';

const { t } = useI18n();

defineProps<{
  src: string;
  name: string;
}>();

defineEmits<{
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <div class="ai-image-preview" @click.self="$emit('close')">
      <button class="ai-image-preview__close" @click="$emit('close')" :title="`${t.aiClose} (Esc)`">×</button>
      <img :src="src" :alt="name" />
      <div class="ai-image-preview__caption">{{ name }}</div>
    </div>
  </Teleport>
</template>

<style scoped>
.ai-image-preview {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 40px;
  cursor: zoom-out;
}
.ai-image-preview > img {
  max-width: 100%;
  max-height: calc(100vh - 120px);
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.6);
}
.ai-image-preview__caption {
  margin-top: 12px;
  color: #fff;
  font-size: 13px;
  font-family: var(--code-font-family, monospace);
  opacity: 0.85;
}
.ai-image-preview__close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255,255,255,0.15);
  color: #fff;
  border: none;
  font-size: 22px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ai-image-preview__close:hover { background: rgba(255,255,255,0.25); }
</style>
