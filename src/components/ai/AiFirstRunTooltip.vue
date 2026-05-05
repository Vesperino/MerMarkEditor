<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from '../../i18n';
import { useSettings } from '../../composables/useSettings';

const emit = defineEmits<{ openSettings: [] }>();
const { t } = useI18n();
const { settings, setAiHasSeenFirstRun } = useSettings();
const visible = ref(false);

onMounted(() => {
  if (settings.value.ai.enabled && !settings.value.ai.hasSeenFirstRun) {
    visible.value = true;
  }
});

const ack = () => { setAiHasSeenFirstRun(true); visible.value = false; };
const open = () => { emit('openSettings'); ack(); };
</script>

<template>
  <div v-if="visible" class="ai-first-run">
    <div class="ai-first-run__title">{{ t.aiFirstRunTitle }}</div>
    <div class="ai-first-run__body">{{ t.aiFirstRunBody }}</div>
    <div class="ai-first-run__actions">
      <button @click="ack">{{ t.aiFirstRunOk }}</button>
      <button @click="open">{{ t.aiFirstRunOpenSettings }}</button>
    </div>
  </div>
</template>

<style scoped>
.ai-first-run {
  position: absolute;
  top: 40px;
  right: 12px;
  background: var(--popover-bg, #fff);
  border: 1px solid var(--border-color, #ddd);
  border-radius: 6px;
  padding: 12px;
  box-shadow: 0 6px 24px rgba(0,0,0,.12);
  z-index: 200;
  max-width: 280px;
}
.ai-first-run__title { font-weight: 600; margin-bottom: 4px; }
.ai-first-run__body { font-size: 13px; opacity: .8; margin-bottom: 8px; }
.ai-first-run__actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
