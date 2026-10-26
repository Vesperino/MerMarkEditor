<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from '../../i18n';
import { useSettings, type CliKind } from '../../composables/useSettings';
import { useAiHealth } from '../../composables/useAiHealth';
import { useAiModels } from '../../composables/useAiModels';
import { isOutdated, useAiCliUpdates, type UpdatableCli } from '../../composables/useAiCliUpdates';

const props = defineProps<{ cli: CliKind }>();

const { t } = useI18n();
const { settings } = useSettings();
const { cache, check } = useAiHealth();
const { refreshClaudeModels, refreshCodexModels } = useAiModels();
const { latest, updating, updateError, checkLatest, update } = useAiCliUpdates();

const updatable = computed<UpdatableCli | null>(() => (props.cli === 'claude' || props.cli === 'codex' ? props.cli : null));
const newest = computed(() => (updatable.value ? latest.value[updatable.value] : undefined));
const error = computed(() => (updatable.value ? updateError.value[updatable.value] : ''));
const visible = computed(() => {
  const status = cache.value[props.cli];
  return !!updatable.value && !!status?.ok && (!!error.value || isOutdated(status.version, newest.value));
});

watch(updatable, (cli) => { if (cli) void checkLatest(cli); }, { immediate: true });

async function run() {
  const cli = updatable.value;
  if (!cli) return;
  const ai = settings.value.ai;
  const path = (cli === 'claude' ? ai.cliPathClaude || ai.cliResolvedPathClaude : ai.cliPathCodex || ai.cliResolvedPathCodex) || null;
  if (!(await update(cli, path))) return;
  const status = await check(cli, true);
  if (cli === 'codex') await refreshCodexModels(path);
  else await refreshClaudeModels(status.version);
}
</script>

<template>
  <div v-if="visible && updatable" class="ai-cli-update">
    <span class="ai-cli-update__text" :title="error || undefined">
      {{ error ? t.aiCliUpdateFailed : t.aiCliUpdateAvailable(newest ?? '') }}
    </span>
    <button class="ai-cli-update__btn" :disabled="updating[updatable]" @click="run">
      {{ updating[updatable] ? t.aiCliUpdating : t.aiCliUpdate }}
    </button>
  </div>
</template>

<style scoped>
.ai-cli-update {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  font-size: 12px;
  color: var(--text-secondary);
}

.ai-cli-update__btn {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 4px;
  border: 1px solid var(--primary);
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
}

.ai-cli-update__btn:disabled {
  opacity: 0.6;
  cursor: progress;
}
</style>
