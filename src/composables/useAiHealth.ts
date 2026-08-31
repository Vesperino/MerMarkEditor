import { ref } from 'vue';
import { aiCommands, type CliKind, type HealthStatus } from '../services/aiCommands';
import { useSettings } from './useSettings';

const CLI_HEALTH_STORAGE_KEY = 'mermark-ai-cli-health';
const CLI_KINDS = ['claude', 'codex'] as const;
type BinaryCliKind = typeof CLI_KINDS[number];
type PersistedCliHealth = Partial<Record<BinaryCliKind, { status: HealthStatus; checkedAt: number }>>;

function isHealthStatus(value: unknown): value is HealthStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<HealthStatus>;
  return typeof status.ok === 'boolean'
    && (typeof status.version === 'string' || status.version === null)
    && (typeof status.account === 'string' || status.account === null)
    && (typeof status.error === 'string' || status.error === null)
    && (typeof status.resolvedPath === 'string' || status.resolvedPath === null);
}

export function readPersistedCliHealth(): PersistedCliHealth {
  try {
    const raw = localStorage.getItem(CLI_HEALTH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: PersistedCliHealth = {};
    for (const cli of CLI_KINDS) {
      const entry = parsed[cli] as { status?: unknown; checkedAt?: unknown } | undefined;
      if (entry && isHealthStatus(entry.status) && typeof entry.checkedAt === 'number') {
        result[cli] = { status: entry.status, checkedAt: entry.checkedAt };
      }
    }
    return result;
  } catch {
    return {};
  }
}

const persisted = readPersistedCliHealth();
const cache = ref<Record<CliKind, HealthStatus | null>>({
  claude: persisted.claude?.status ?? null,
  codex: persisted.codex?.status ?? null,
  ollama: null,
  openai: null,
});
const lastCheckedAt = ref<Record<CliKind, number | null>>({
  claude: persisted.claude?.checkedAt ?? null,
  codex: persisted.codex?.checkedAt ?? null,
  ollama: null,
  openai: null,
});
const loading = ref<Record<CliKind, boolean>>({ claude: false, codex: false, ollama: false, openai: false });

function persistCliHealth() {
  const stored: PersistedCliHealth = {};
  for (const cli of CLI_KINDS) {
    const status = cache.value[cli];
    const checkedAt = lastCheckedAt.value[cli];
    if (status && checkedAt !== null) stored[cli] = { status, checkedAt };
  }
  try {
    localStorage.setItem(CLI_HEALTH_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // A health check should still succeed when browser storage is unavailable.
  }
}

export function useAiHealth() {
  const {
    settings,
    setAiCliResolvedPathClaude,
    setAiCliResolvedPathCodex,
  } = useSettings();

  /**
   * Path passed to the backend `override_path`. Priority:
   *   1. User's explicit override (`cliPathClaude` / `cliPathCodex`).
   *   2. Last-known-good auto-resolved path cached from a prior session
   *      (`cliResolvedPathClaude` / `cliResolvedPathCodex`).
   *   3. None — backend falls back to its full PATH + curated-dir scan.
   *
   * Re-check bypasses automatic paths. If a cached installation disappears,
   * check retries discovery without changing an explicit user selection.
   */
  function overrideFor(cli: CliKind, force = false): string | null {
    // Ollama / OpenAI-compatible have no binary path — the "override" channel
    // carries their base URL instead.
    if (cli === 'ollama') return (settings.value.ai.ollamaBaseUrl ?? '').trim() || null;
    if (cli === 'openai') return (settings.value.ai.openaiBaseUrl ?? '').trim() || null;
    const manualRaw = cli === 'claude' ? settings.value.ai.cliPathClaude : settings.value.ai.cliPathCodex;
    const manual = (manualRaw ?? '').trim();
    if (manual) return manual;
    if (force) return null;
    const cachedRaw = cli === 'claude'
      ? settings.value.ai.cliResolvedPathClaude
      : settings.value.ai.cliResolvedPathCodex;
    const cached = (cachedRaw ?? '').trim();
    return cached || null;
  }

  function persistResolved(cli: CliKind, status: HealthStatus) {
    if (!status.ok) return;
    // Ollama / OpenAI-compatible resolved path is just the echoed base URL —
    // nothing to cache.
    if (cli === 'ollama' || cli === 'openai') return;
    // Only update the cache when the user has NOT pinned a manual override —
    // otherwise we'd second-guess their choice on every probe.
    const manualRaw = cli === 'claude' ? settings.value.ai.cliPathClaude : settings.value.ai.cliPathCodex;
    if ((manualRaw ?? '').trim()) return;

    const resolved = (status.resolvedPath ?? '').trim();
    if (!resolved) return;
    if (cli === 'claude') setAiCliResolvedPathClaude(resolved);
    else setAiCliResolvedPathCodex(resolved);
  }

  async function check(cli: CliKind, force = false): Promise<HealthStatus> {
    if (!force && cache.value[cli]) {
      return cache.value[cli] as HealthStatus;
    }
    loading.value[cli] = true;
    try {
      if (force && (cli === 'claude' || cli === 'codex')) forgetResolvedCache(cli);
      let r = await aiCommands.healthCheck(cli, overrideFor(cli, force));
      // A desktop update can remove the previously cached bundle. Only retry
      // automatic paths; an explicit user selection must never be ignored.
      const manual = cli === 'codex' ? settings.value.ai.cliPathCodex : settings.value.ai.cliPathClaude;
      if (!force && (cli === 'claude' || cli === 'codex') && !manual?.trim() && !r.ok && !r.version && overrideFor(cli)) {
        forgetResolvedCache(cli);
        r = await aiCommands.healthCheck(cli, null);
      }
      cache.value[cli] = r;
      lastCheckedAt.value[cli] = Date.now();
      if (cli === 'claude' || cli === 'codex') persistCliHealth();
      persistResolved(cli, r);
      return r;
    } catch (e) {
      const errStatus: HealthStatus = {
        ok: false,
        version: null,
        account: null,
        error: (e as Error)?.message ?? String(e),
        resolvedPath: null,
      };
      cache.value[cli] = errStatus;
      lastCheckedAt.value[cli] = Date.now();
      if (cli === 'claude' || cli === 'codex') persistCliHealth();
      return errStatus;
    } finally {
      loading.value[cli] = false;
    }
  }

  async function checkAll(force = false) {
    await Promise.all([
      check('claude', force),
      check('codex', force),
      check('ollama', force),
      check('openai', force),
    ]);
  }

  async function checkCliOnStartup() {
    if (!settings.value.ai.checkCliHealthOnStartup) return;
    await Promise.all([check('claude'), check('codex')]);
  }

  function getCached(cli: CliKind) { return cache.value[cli]; }
  function reset(clearPersisted = false) {
    cache.value = { claude: null, codex: null, ollama: null, openai: null };
    lastCheckedAt.value = { claude: null, codex: null, ollama: null, openai: null };
    if (clearPersisted) {
      try { localStorage.removeItem(CLI_HEALTH_STORAGE_KEY); } catch { /* ignore */ }
    }
  }

  /**
   * Forget the auto-resolved path cache (does not touch manual overrides).
   * Useful when the user has installed/upgraded the CLI and the cached path
   * no longer exists or points at a stale binary.
   */
  function forgetResolvedCache(cli?: CliKind) {
    if (!cli || cli === 'claude') setAiCliResolvedPathClaude('');
    if (!cli || cli === 'codex') setAiCliResolvedPathCodex('');
  }

  return {
    check, checkAll, checkCliOnStartup, getCached, lastCheckedAt, reset, cache, loading,
    forgetResolvedCache,
  };
}
