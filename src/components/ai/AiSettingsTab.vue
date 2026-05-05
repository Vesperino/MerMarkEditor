<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { useI18n } from '../../i18n';
import { useSettings, type CliKind, type PanelSide } from '../../composables/useSettings';
import { useAi } from '../../composables/useAi';
import { useAiHealth } from '../../composables/useAiHealth';
import { useAiAudit } from '../../composables/useAiAudit';
import { CLAUDE_MODELS, CODEX_MODELS, CLAUDE_EFFORTS, CODEX_EFFORTS } from '../../composables/useAiModels';

const { t } = useI18n();
const {
  settings,
  setAiEnabled,
  setAiDefaultCli,
  setAiDefaultModelClaude,
  setAiDefaultModelCodex,
  setAiEffortClaude,
  setAiEffortCodex,
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

    <section class="ai-settings-section">
      <h4>Effort</h4>
      <label class="ai-inline-label">
        {{ t.aiCliStatusClaude }}
        <select :value="settings.ai.effortClaude" @change="setAiEffortClaude(($event.target as HTMLSelectElement).value)">
          <option v-for="e in CLAUDE_EFFORTS" :key="e.id" :value="e.id">{{ e.label }}</option>
        </select>
      </label>
      <label class="ai-inline-label" style="margin-top: 8px;">
        {{ t.aiCliStatusCodex }}
        <select :value="settings.ai.effortCodex" @change="setAiEffortCodex(($event.target as HTMLSelectElement).value)">
          <option v-for="e in CODEX_EFFORTS" :key="e.id" :value="e.id">{{ e.label }}</option>
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
.ai-settings { padding: 16px 20px; max-width: 720px; }
.ai-settings-section {
  padding: 16px 0;
  border-bottom: 1px solid var(--border-primary);
}
.ai-settings-section:last-child { border-bottom: none; }
.ai-settings-section--alert {
  background: rgba(239, 68, 68, 0.06);
  border-left: 3px solid var(--danger);
  padding-left: 14px;
  margin-left: -17px;
  margin-right: -3px;
}
.ai-settings-section h4 {
  margin: 0 0 12px;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--primary);
  text-transform: uppercase;
  font-weight: 700;
}

/* Toggle (checkbox) labels */
.ai-toggle-label {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
  font-size: 13px;
}
.ai-toggle-label input[type="checkbox"] { margin-top: 2px; flex-shrink: 0; }
.ai-toggle-label strong { font-weight: 600; }

/* Inline label = label text + control on the same row */
.ai-inline-label {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 12px;
  align-items: center;
  padding: 6px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

/* Unified input/select styling */
.ai-settings select,
.ai-settings input[type="number"],
.ai-settings input[type="text"] {
  background: var(--bg-input);
  color: var(--text-primary);
  border: 1px solid var(--border-primary);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 100ms ease, box-shadow 100ms ease, background 100ms ease;
  min-width: 160px;
  cursor: pointer;
}
.ai-settings select:hover,
.ai-settings input:hover {
  border-color: var(--border-secondary);
}
.ai-settings select:focus,
.ai-settings input:focus {
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 3px var(--focus-ring-alpha);
}
.ai-settings select:disabled,
.ai-settings input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ai-helper {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 6px;
  padding-left: 152px;
}

/* CLI rows — kept from previous polish */
.ai-cli-row {
  display: grid;
  grid-template-columns: 160px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
}
.ai-cli-name { font-weight: 600; font-size: 13px; color: var(--text-primary); }
.ai-cli-sub {
  display: block;
  font-size: 11px;
  opacity: 0.65;
  font-family: var(--code-font-family, monospace);
  margin-top: 2px;
}
.ai-cli-status-col {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.ai-cli-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ai-cli-dot--ok { background: var(--success); box-shadow: 0 0 0 3px rgba(16,185,129,0.18); }
.ai-cli-dot--err { background: var(--danger); }
.ai-cli-dot--unknown { background: var(--text-faint); }
.ai-cli-dot--loading {
  background: var(--text-faint);
  animation: ai-pulse 1.2s ease-in-out infinite;
}
.ai-cli-status { font-size: 13px; color: var(--text-primary); }
.ai-cli-err {
  display: block;
  font-size: 11px;
  color: var(--danger);
  margin-top: 2px;
  font-family: var(--code-font-family, monospace);
}
.ai-cli-actions { display: flex; gap: 6px; }

/* Buttons — match design language */
.ai-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-primary);
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: background 100ms ease, border-color 100ms ease;
}
.ai-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--border-secondary);
}
.ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ai-btn--secondary {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}
.ai-btn--secondary:hover:not(:disabled) {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}

/* Audit table */
.ai-empty {
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
.ai-audit-table {
  width: 100%;
  font-size: 11px;
  margin-top: 8px;
  border-collapse: collapse;
  background: var(--bg-secondary);
  border-radius: 6px;
  overflow: hidden;
}
.ai-audit-table th {
  text-align: left;
  padding: 6px 10px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-primary);
}
.ai-audit-table td {
  padding: 5px 10px;
  border-bottom: 1px solid var(--border-primary);
  font-family: var(--code-font-family, monospace);
  color: var(--text-secondary);
}
.ai-audit-table tr:last-child td { border-bottom: none; }
.ai-audit-actions { margin-top: 10px; display: flex; gap: 6px; }

/* Details / summary */
details > summary {
  cursor: pointer;
  user-select: none;
  padding: 4px 0;
  color: var(--text-secondary);
  font-size: 13px;
}
details > summary:hover { color: var(--text-primary); }
details > summary strong { font-weight: 600; }

.ai-link {
  font-size: 12px;
  color: var(--primary);
  text-decoration: none;
}
.ai-link:hover { text-decoration: underline; }

@keyframes ai-pulse {
  0%, 100% { opacity: 0.4; transform: scale(0.85); }
  50% { opacity: 1; transform: scale(1.1); }
}
</style>
