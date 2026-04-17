<script setup lang="ts">
import type { LineEntry } from '../composables/useLineNumbers';

defineProps<{
  lines: LineEntry[];
}>();
</script>

<template>
  <div class="editor-gutter" aria-hidden="true">
    <span
      v-for="line in lines"
      :key="line.num"
      class="editor-gutter-line"
      :style="{
        top: `calc(var(--editor-content-padding-top, 60px) + ${line.top}px)`,
        height: `${line.height}px`,
      }"
    >{{ line.num }}</span>
  </div>
</template>

<style scoped>
.editor-gutter {
  position: absolute;
  top: 0;
  left: 0;
  width: calc(80px + var(--editor-gutter-width, 3.5em));
  height: 100%;
  pointer-events: none;
  user-select: none;
  font-family: var(--code-font-family, monospace);
  font-size: 0.85em;
  color: var(--text-secondary, #888);
  opacity: 0.7;
}

.editor-gutter-line {
  position: absolute;
  right: 0.5em;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  line-height: 1;
}
</style>
