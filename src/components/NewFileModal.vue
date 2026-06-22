<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue';
import { t } from '../i18n';

const emit = defineEmits<{ choose: [kind: 'plain' | 'marp']; close: [] }>();

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="nf-overlay" @click.self="emit('close')">
    <div class="nf-dialog">
      <h3 class="nf-title">{{ t.newFileChoiceTitle }}</h3>
      <div class="nf-cards">
        <button class="nf-card" @click="emit('choose', 'plain')">
          <span class="nf-icon">📄</span>
          <span class="nf-name">{{ t.newFilePlain }}</span>
          <span class="nf-desc">{{ t.newFilePlainDesc }}</span>
        </button>
        <button class="nf-card nf-card--marp" @click="emit('choose', 'marp')">
          <span class="nf-icon">🎬</span>
          <span class="nf-name">{{ t.newFileMarp }}</span>
          <span class="nf-desc">{{ t.newFileMarpDesc }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.nf-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.nf-dialog {
  width: min(520px, 92vw);
  background: var(--dialog-bg);
  border: 1px solid var(--border-primary);
  border-radius: 12px;
  box-shadow: var(--shadow-dropdown);
  padding: 20px;
}
.nf-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}
.nf-cards {
  display: flex;
  gap: 12px;
}
.nf-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--border-primary);
  border-radius: 10px;
  background: var(--bg-input);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}
.nf-card:hover {
  border-color: var(--primary, #6b5bd2);
  background: var(--hover-bg);
}
.nf-card--marp:hover {
  background: linear-gradient(135deg, rgba(107, 91, 210, 0.16), rgba(107, 91, 210, 0.04));
}
.nf-icon {
  font-size: 28px;
}
.nf-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}
.nf-desc {
  font-size: 12px;
  color: var(--text-muted);
}
</style>
