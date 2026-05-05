<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { useI18n } from '../../i18n';
import { useSettings, type CliKind, type PanelSide } from '../../composables/useSettings';
import { useAi } from '../../composables/useAi';
import { useAiHealth } from '../../composables/useAiHealth';
import { useAiAudit } from '../../composables/useAiAudit';
import { CLAUDE_MODELS, CODEX_MODELS } from '../../composables/useAiModels';

const { t } = useI18n();
const {
  settings,
  setAiEnabled,
  setAiDefaultCli,
  setAiDefaultModelClaude,
  setAiDefaultModelCodex,
  setAiSnapshotsKeep,
  setAiPanelSide,
  setAiHasSeenFirstRun,
} = useSettings();
const { check, cache, loading } = useAiHealth();
const { bypassEnabled } = useAi();
const { entries: auditEntries, load: loadAudit, clear: clearAudit } = useAiAudit();

onMounted(async () => {
  await Promise.allSettled([
    check('claude'),
    check('codex'),
    loadAudit(),
  ]);
});

async function recheck(cli: CliKind) {
  await check(cli, true);
}

function dotClass(cli: CliKind): string {
  if (loading.value[cli]) return 'ai-cli-dot--loading';
  const s = cache.value[cli];
  if (!s) return 'ai-cli-dot--unknown';
  return s.ok ? 'ai-cli-dot--ok' : 'ai-cli-dot--err';
}

function statusText(cli: CliKind): string {
  if (loading.value[cli]) return t.value.aiStatusLoading;
  const s = cache.value[cli];
  if (!s) return t.value.aiStatusUnknown;
  if (s.ok) return t.value.aiStatusOk(s.account ?? '');
  if (s.error?.toLowerCase().includes('binary') || s.error?.toLowerCase().includes('not found')) {
    return t.value.aiStatusBinaryMissing;
  }
  return t.value.aiStatusAuthRequired;
}

function statusOk(cli: CliKind): boolean {
  return cache.value[cli]?.ok ?? false;
}

const anyCliHealthy = computed(() => statusOk('claude') || statusOk('codex'));

const installUrl: Record<CliKind, string> = {
  claude: 'https://docs.claude.com/en/docs/claude-code/setup',
  codex: 'https://github.com/openai/codex',
};

async function openInstall(cli: CliKind) {
  await openExternal(installUrl[cli]);
}
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
        <strong>{{ t.aiEnableLabel }}</strong>
      </label>
    </section>

    <section class="ai-settings-section">
      <h4>CLI</h4>
      <div v-for="cli in (['claude', 'codex'] as CliKind[])" :key="cli" class="ai-cli-row">
        <div class="ai-cli-name-col">
          <span class="ai-cli-name">{{ cli === 'claude' ? t.aiCliStatusClaude : t.aiCliStatusCodex }}</span>
          <span class="ai-cli-sub">{{ cache[cli]?.version ?? '' }}</span>
        </div>
        <div class="ai-cli-status-col">
          <span class="ai-cli-dot" :class="dotClass(cli)" />
          <span class="ai-cli-status">{{ statusText(cli) }}</span>
          <small v-if="cache[cli]?.error" class="ai-cli-err">{{ cache[cli]?.error }}</small>
        </div>
        <div class="ai-cli-actions">
          <button class="ai-btn" @click="recheck(cli)" :disabled="loading[cli]">
            {{ loading[cli] ? '…' : t.aiRecheck }}
          </button>
          <button v-if="!statusOk(cli)" class="ai-btn ai-btn--secondary" @click="openInstall(cli)">
            {{ t.aiInstall }}
          </button>
        </div>
      </div>
    </section>

    <section class="ai-settings-section">
      <label class="ai-inline-label">
        {{ t.aiDefaultCli }}
        <select
          :value="settings.ai.defaultCli"
          :disabled="!anyCliHealthy"
          @change="setAiDefaultCli((($event.target as HTMLSelectElement).value) as CliKind)"
        >
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
      </label>
    </section>

    <section class="ai-settings-section">
      <h4>{{ t.aiModel }}</h4>
      <label class="ai-inline-label">
        {{ t.aiCliStatusClaude }}
        <select :value="settings.ai.defaultModelClaude" @change="setAiDefaultModelClaude(($event.target as HTMLSelectElement).value)">
          <option v-for="m in CLAUDE_MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </label>
      <label class="ai-inline-label" style="margin-top: 8px;">
        {{ t.aiCliStatusCodex }}
        <select :value="settings.ai.defaultModelCodex" @change="setAiDefaultModelCodex(($event.target as HTMLSelectElement).value)">
          <option v-for="m in CODEX_MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
        </select>
      </label>
    </section>

    <section class="ai-settings-section" :class="{ 'ai-settings-section--alert': bypassEnabled }">
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
      <label class="ai-inline-label">
        {{ t.aiSnapshotsKeep }}
        <input
          type="number"
          min="1"
          :value="settings.ai.snapshotsKeep"
          @change="setAiSnapshotsKeep(Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <small class="ai-helper">{{ t.aiSnapshotsKeepHelper }}</small>
    </section>

    <section class="ai-settings-section">
      <label class="ai-inline-label">
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
        <summary><strong>{{ t.aiAuditLog }}</strong> ({{ auditEntries.length }})</summary>
        <div v-if="auditEntries.length === 0" class="ai-empty">{{ t.aiAuditEmpty }}</div>
        <table v-else class="ai-audit-table">
          <thead>
            <tr><th>ts</th><th>cli</th><th>action</th></tr>
          </thead>
          <tbody>
            <tr v-for="(e, i) in auditEntries.slice(-100)" :key="i">
              <td>{{ e.ts }}</td>
              <td>{{ e.cli }}</td>
              <td>{{ e.action }}</td>
            </tr>
          </tbody>
        </table>
        <div class="ai-audit-actions">
          <button class="ai-btn" @click="clearAudit">{{ t.aiAuditClear }}</button>
        </div>
      </details>
    </section>

    <section v-if="settings.ai.hasSeenFirstRun" class="ai-settings-section">
      <a href="#" class="ai-link" @click.prevent="setAiHasSeenFirstRun(false)">
        {{ t.aiResetFirstRun }}
      </a>
    </section>
  </div>
</template>

<style scoped>
.ai-settings {
  padding: 16px 20px;
  max-width: 720px;
}
.ai-settings-section {
  padding: 16px 0;
  border-bottom: 1px solid var(--border-color, #eee);
}
.ai-settings-section:last-child { border-bottom: none; }
.ai-settings-section--alert {
  background: rgba(239, 68, 68, 0.06);
  border-left: 3px solid #ef4444;
  padding-left: 12px;
  margin-left: -15px;
}
.ai-settings-section h4 {
  margin: 0 0 10px;
  font-size: 13px;
  letter-spacing: .02em;
  color: var(--accent-color, #0078d7);
  text-transform: uppercase;
}
.ai-toggle-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}
.ai-toggle-label input { margin-top: 2px; }
.ai-inline-label {
  display: flex;
  align-items: center;
  gap: 10px;
}
.ai-helper {
  display: block;
  font-size: 11px;
  opacity: .65;
  margin-top: 4px;
}
.ai-cli-row {
  display: grid;
  grid-template-columns: 140px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
}
.ai-cli-name { font-weight: 600; font-size: 13px; }
.ai-cli-sub { display: block; font-size: 11px; opacity: .6; font-family: var(--code-font-family, monospace); }
.ai-cli-status-col { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.ai-cli-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ai-cli-dot--ok { background: #22c55e; }
.ai-cli-dot--err { background: #ef4444; }
.ai-cli-dot--unknown { background: #94a3b8; }
.ai-cli-dot--loading { background: #94a3b8; animation: ai-pulse 1.2s ease-in-out infinite; }
.ai-cli-status { font-size: 13px; }
.ai-cli-err {
  display: block;
  width: 100%;
  font-size: 11px;
  color: #ef4444;
  margin-top: 2px;
  font-family: var(--code-font-family, monospace);
  word-break: break-all;
}
.ai-cli-actions { display: flex; gap: 6px; }
.ai-btn {
  padding: 4px 10px;
  border-radius: 4px;
  border: 1px solid var(--border-color, #ddd);
  background: var(--button-bg, #fff);
  cursor: pointer;
  font-size: 12px;
}
.ai-btn:hover:not(:disabled) { background: var(--button-hover, #f8fafc); }
.ai-btn:disabled { opacity: .5; cursor: not-allowed; }
.ai-btn--secondary { background: var(--accent-color, #0078d7); color: #fff; border-color: var(--accent-color, #0078d7); }
.ai-empty {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  opacity: .6;
  font-style: italic;
}
.ai-audit-table { width: 100%; font-size: 11px; margin-top: 8px; border-collapse: collapse; }
.ai-audit-table th, .ai-audit-table td {
  text-align: left;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-color, #f1f5f9);
}
.ai-audit-table th { font-weight: 600; opacity: .7; }
.ai-audit-table td { font-family: var(--code-font-family, monospace); }
.ai-audit-actions { margin-top: 8px; display: flex; gap: 6px; }
.ai-link {
  font-size: 12px;
  color: var(--accent-color, #0078d7);
  text-decoration: none;
}
.ai-link:hover { text-decoration: underline; }
@keyframes ai-pulse {
  0%, 100% { opacity: .4; transform: scale(.85); }
  50% { opacity: 1; transform: scale(1.1); }
}
</style>
