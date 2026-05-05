<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { useI18n } from '../../i18n';
import { useSettings, type CliKind, type PanelSide } from '../../composables/useSettings';
import { useAi } from '../../composables/useAi';
import { useAiHealth } from '../../composables/useAiHealth';
import { useAiAudit } from '../../composables/useAiAudit';

const { t } = useI18n();
const {
  settings,
  setAiEnabled,
  setAiDefaultCli,
  setAiSnapshotsKeep,
  setAiPanelSide,
  setAiHasSeenFirstRun,
} = useSettings();
const { check, cache } = useAiHealth();
const { bypassEnabled } = useAi();
const { entries: auditEntries, load: loadAudit, clear: clearAudit } = useAiAudit();

const recheckLoading = ref<{ claude: boolean; codex: boolean }>({ claude: false, codex: false });

onMounted(async () => {
  await check('claude').catch(() => {});
  await check('codex').catch(() => {});
  await loadAudit().catch(() => {});
});

async function recheck(cli: CliKind) {
  recheckLoading.value[cli] = true;
  try {
    await check(cli, true);
  } finally {
    recheckLoading.value[cli] = false;
  }
}

function statusText(cli: CliKind): string {
  const s = cache.value[cli];
  if (!s) return '...';
  if (s.ok) return t.value.aiStatusOk(s.account ?? '');
  if (s.error?.toLowerCase().includes('binary')) return t.value.aiStatusBinaryMissing;
  return t.value.aiStatusAuthRequired;
}

function statusOk(cli: CliKind): boolean {
  return cache.value[cli]?.ok ?? false;
}

const installUrl: Record<CliKind, string> = {
  claude: 'https://docs.claude.com/en/docs/claude-code/setup',
  codex: 'https://github.com/openai/codex',
};

async function openInstall(cli: CliKind) {
  await openExternal(installUrl[cli]);
}

const showResetFirstRun = computed(() => settings.value.ai.hasSeenFirstRun);
</script>

<template>
  <div class="ai-settings">
    <section class="ai-settings-section">
      <label class="ai-toggle-label">
        <input
          type="checkbox"
          :checked="settings.ai.enabled"
          @change="setAiEnabled(($event.target as HTMLInputElement).checked)"
        />
        {{ t.aiEnableLabel }}
      </label>
    </section>

    <section class="ai-settings-section">
      <h4>CLI</h4>
      <div v-for="cli in (['claude','codex'] as CliKind[])" :key="cli" class="ai-cli-row">
        <span class="ai-cli-name">
          {{ cli === 'claude' ? t.aiCliStatusClaude : t.aiCliStatusCodex }}
        </span>
        <span class="ai-cli-status" :class="{ ok: statusOk(cli), err: !statusOk(cli) }">
          {{ statusText(cli) }}
        </span>
        <button @click="recheck(cli)" :disabled="recheckLoading[cli]">{{ t.aiRecheck }}</button>
        <button v-if="!statusOk(cli)" @click="openInstall(cli)">{{ t.aiInstall }}</button>
      </div>
    </section>

    <section class="ai-settings-section">
      <label>
        {{ t.aiDefaultCli }}
        <select
          :value="settings.ai.defaultCli"
          @change="setAiDefaultCli((($event.target as HTMLSelectElement).value) as CliKind)"
        >
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
      </label>
    </section>

    <section class="ai-settings-section">
      <h4>{{ t.aiBypassLabel }}</h4>
      <label class="ai-toggle-label">
        <input
          type="checkbox"
          :checked="bypassEnabled"
          @change="bypassEnabled = ($event.target as HTMLInputElement).checked"
        />
        <span>{{ t.aiBypassHelper }}</span>
      </label>
    </section>

    <section class="ai-settings-section">
      <label>
        {{ t.aiSnapshotsKeep }}
        <input
          type="number"
          min="1"
          :value="settings.ai.snapshotsKeep"
          @change="setAiSnapshotsKeep(Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </section>

    <section class="ai-settings-section">
      <label>
        {{ t.aiPanelSide }}
        <select
          :value="settings.ai.panelSide"
          @change="setAiPanelSide((($event.target as HTMLSelectElement).value) as PanelSide)"
        >
          <option value="right">{{ t.aiPanelSideRight }}</option>
          <option value="left">{{ t.aiPanelSideLeft }}</option>
        </select>
      </label>
    </section>

    <section class="ai-settings-section">
      <details>
        <summary>{{ t.aiAuditLog }} ({{ auditEntries.length }})</summary>
        <table class="ai-audit-table">
          <thead><tr><th>ts</th><th>cli</th><th>action</th></tr></thead>
          <tbody>
            <tr v-for="(e, i) in auditEntries.slice(-100)" :key="i">
              <td>{{ e.ts }}</td>
              <td>{{ e.cli }}</td>
              <td>{{ e.action }}</td>
            </tr>
          </tbody>
        </table>
        <button @click="clearAudit">{{ t.aiAuditClear }}</button>
      </details>
    </section>

    <section v-if="showResetFirstRun" class="ai-settings-section">
      <a href="#" @click.prevent="setAiHasSeenFirstRun(false)">{{ t.aiFirstRunTitle }}</a>
    </section>
  </div>
</template>

<style scoped>
.ai-settings { padding: 12px; }
.ai-settings-section { padding: 10px 0; border-bottom: 1px solid var(--border-color, #eee); }
.ai-settings-section h4 { margin: 0 0 8px; font-size: 13px; }
.ai-toggle-label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
.ai-cli-row { display: grid; grid-template-columns: 110px 1fr auto auto; gap: 8px; align-items: center; padding: 4px 0; }
.ai-cli-status.ok { color: #22c55e; }
.ai-cli-status.err { color: #ef4444; }
.ai-audit-table { width: 100%; font-size: 12px; margin-top: 8px; border-collapse: collapse; }
.ai-audit-table th, .ai-audit-table td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--border-color, #f1f5f9); }
</style>
