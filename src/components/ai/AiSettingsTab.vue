<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { open as openExternal } from '@tauri-apps/plugin-shell';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useI18n } from '../../i18n';
import { useSettings, type CliKind, type PanelSide } from '../../composables/useSettings';
import { useAi } from '../../composables/useAi';
import { useAiHealth } from '../../composables/useAiHealth';
import { useAiAudit } from '../../composables/useAiAudit';
import { CLAUDE_MODELS, CODEX_MODELS, CLAUDE_EFFORTS, CODEX_EFFORTS, CUSTOM_MODEL_SENTINEL } from '../../composables/useAiModels';

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
  setAiCliPathClaude,
  setAiCliPathCodex,
} = useSettings();
const { check, cache, loading } = useAiHealth();
const { bypassEnabled } = useAi();
const { entries: auditEntries, load: loadAudit, clear: clearAudit } = useAiAudit();

const customClaude = ref<string>('');
const customCodex = ref<string>('');

onMounted(async () => {
  await Promise.allSettled([
    check('claude'),
    check('codex'),
    loadAudit(),
  ]);
  if (isCustom('claude')) customClaude.value = settings.value.ai.defaultModelClaude;
  if (isCustom('codex')) customCodex.value = settings.value.ai.defaultModelCodex;
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

function setCliPath(cli: CliKind, value: string) {
  if (cli === 'claude') setAiCliPathClaude(value);
  else setAiCliPathCodex(value);
}

function getCliPath(cli: CliKind): string {
  return cli === 'claude' ? settings.value.ai.cliPathClaude : settings.value.ai.cliPathCodex;
}

async function browseCliPath(cli: CliKind) {
  try {
    const picked = await openDialog({
      multiple: false,
      directory: false,
      title: cli === 'claude' ? 'Select claude binary' : 'Select codex binary',
    });
    if (typeof picked === 'string' && picked.trim()) {
      setCliPath(cli, picked);
      await check(cli, true);
    }
  } catch (e) {
    console.error('[AiSettings] browseCliPath failed:', e);
  }
}

async function applyCliPath(cli: CliKind, value: string) {
  setCliPath(cli, value);
  await check(cli, true);
}

type OsKind = 'mac' | 'win' | 'linux';

function detectOs(): OsKind {
  const ua = (navigator.userAgent || '').toLowerCase();
  const plat = (navigator.platform || '').toLowerCase();
  if (ua.includes('mac') || plat.includes('mac')) return 'mac';
  if (ua.includes('win') || plat.includes('win')) return 'win';
  return 'linux';
}

const currentOs = detectOs();

function placeholderFor(cli: CliKind): string {
  switch (currentOs) {
    case 'mac':
      return `/opt/homebrew/bin/${cli}`;
    case 'win':
      return `C:\\Users\\<you>\\AppData\\Roaming\\npm\\${cli}.cmd`;
    default:
      return `/usr/local/bin/${cli}`;
  }
}

function searchedPaths(): string[] {
  switch (currentOs) {
    case 'mac':
      return [
        'PATH (incl. /opt/homebrew/bin, /usr/local/bin)',
        '~/.npm-global/bin, ~/.bun/bin, ~/.volta/bin, ~/.cargo/bin',
        '~/.nvm/versions/node/*/bin, ~/.local/bin',
        'login shell (zsh -lc) — sources ~/.zprofile, ~/.zshrc',
      ];
    case 'win':
      return [
        'PATH with PATHEXT (.exe / .cmd / .bat)',
        'no extra fallbacks — install via npm / scoop / winget keeps PATH set',
      ];
    default:
      return [
        'PATH (incl. /usr/local/bin, /usr/bin)',
        '~/.npm-global/bin, ~/.bun/bin, ~/.volta/bin, ~/.cargo/bin',
        '~/.nvm/versions/node/*/bin, ~/.local/bin',
        'login shell ($SHELL -lc) — sources ~/.bashrc / ~/.zshrc',
      ];
  }
}

function isCustom(cli: 'claude' | 'codex'): boolean {
  const cur = cli === 'claude' ? settings.value.ai.defaultModelClaude : settings.value.ai.defaultModelCodex;
  const list = cli === 'claude' ? CLAUDE_MODELS : CODEX_MODELS;
  return !list.some(o => o.id === cur && !o.custom);
}

function pickModel(cli: 'claude' | 'codex', id: string) {
  if (id === CUSTOM_MODEL_SENTINEL) {
    if (cli === 'claude') {
      const v = customClaude.value || settings.value.ai.defaultModelClaude;
      customClaude.value = v;
      setAiDefaultModelClaude(v);
    } else {
      const v = customCodex.value || settings.value.ai.defaultModelCodex;
      customCodex.value = v;
      setAiDefaultModelCodex(v);
    }
  } else {
    if (cli === 'claude') setAiDefaultModelClaude(id);
    else setAiDefaultModelCodex(id);
  }
}

function pickCustom(cli: 'claude' | 'codex', v: string) {
  if (cli === 'claude') {
    customClaude.value = v;
    setAiDefaultModelClaude(v);
  } else {
    customCodex.value = v;
    setAiDefaultModelCodex(v);
  }
}

async function copyAudit() {
  const last = auditEntries.value.slice(-50);
  const text = last.map(e => `${e.ts} ${e.cli} ${e.action} args=${JSON.stringify(e.args)}`).join('\n');
  await navigator.clipboard.writeText(text);
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
      <h4>{{ t.aiSettingsCliHeading }}</h4>
      <div v-for="cli in (['claude', 'codex'] as CliKind[])" :key="cli" class="ai-cli-block">
        <div class="ai-cli-row">
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
        <details class="ai-cli-path">
          <summary>{{ t.aiSettingsCliPathHeading }}</summary>
          <div class="ai-cli-path-row">
            <input
              type="text"
              :value="getCliPath(cli)"
              :placeholder="placeholderFor(cli)"
              @change="applyCliPath(cli, ($event.target as HTMLInputElement).value)"
            />
            <button class="ai-btn" @click="browseCliPath(cli)">
              {{ t.aiSettingsCliPathBrowse }}
            </button>
            <button
              class="ai-btn"
              v-if="getCliPath(cli)"
              @click="applyCliPath(cli, '')"
            >
              {{ t.aiSettingsCliPathClear }}
            </button>
          </div>
          <small class="ai-helper ai-helper--inline">{{ t.aiSettingsCliPathHelper }}</small>
          <ul class="ai-cli-path-searched">
            <li v-for="(p, i) in searchedPaths()" :key="i">{{ p }}</li>
          </ul>
        </details>
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
        <div class="ai-inline-control">
          <select
            :value="isCustom('claude') ? CUSTOM_MODEL_SENTINEL : settings.ai.defaultModelClaude"
            @change="pickModel('claude', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="m in CLAUDE_MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
          <input
            v-if="isCustom('claude')"
            type="text"
            :value="customClaude"
            @input="pickCustom('claude', ($event.target as HTMLInputElement).value)"
            :placeholder="t.aiSettingsModelIdPlaceholder"
          />
        </div>
      </label>
      <label class="ai-inline-label" style="margin-top: 8px;">
        {{ t.aiCliStatusCodex }}
        <div class="ai-inline-control">
          <select
            :value="isCustom('codex') ? CUSTOM_MODEL_SENTINEL : settings.ai.defaultModelCodex"
            @change="pickModel('codex', ($event.target as HTMLSelectElement).value)"
          >
            <option v-for="m in CODEX_MODELS" :key="m.id" :value="m.id">{{ m.label }}</option>
          </select>
          <input
            v-if="isCustom('codex')"
            type="text"
            :value="customCodex"
            @input="pickCustom('codex', ($event.target as HTMLInputElement).value)"
            :placeholder="t.aiSettingsModelIdPlaceholder"
          />
        </div>
      </label>
    </section>

    <section class="ai-settings-section">
      <h4>{{ t.aiSettingsEffortHeading }}</h4>
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
          <button class="ai-btn" @click="copyAudit">{{ t.aiSettingsCopyAudit }}</button>
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

/* Inline control: wraps select + optional custom text input */
.ai-inline-control {
  display: flex;
  gap: 8px;
  align-items: center;
  flex: 1;
}
.ai-inline-control select { min-width: 160px; }
.ai-inline-control input[type="text"] { flex: 1; min-width: 140px; }

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
.ai-cli-block { padding: 4px 0; }
.ai-cli-row {
  display: grid;
  grid-template-columns: 160px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
}
.ai-cli-path {
  margin: 0 0 8px 0;
  padding: 0 0 6px 0;
}
.ai-cli-path > summary {
  cursor: pointer;
  user-select: none;
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 0;
}
.ai-cli-path > summary:hover { color: var(--text-secondary); }
.ai-cli-path-row {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 6px;
}
.ai-cli-path-row input[type="text"] { flex: 1; min-width: 200px; }
.ai-helper--inline { padding-left: 0; margin-top: 4px; }
.ai-cli-path-searched {
  margin: 6px 0 0;
  padding-left: 18px;
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--code-font-family, monospace);
  list-style: disc;
}
.ai-cli-path-searched li { margin: 2px 0; }
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
