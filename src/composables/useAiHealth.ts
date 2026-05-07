import { ref } from 'vue';
import { aiCommands, type CliKind, type HealthStatus } from '../services/aiCommands';
import { useSettings } from './useSettings';

const cache = ref<Record<CliKind, HealthStatus | null>>({ claude: null, codex: null });
const lastCheckedAt = ref<Record<CliKind, number | null>>({ claude: null, codex: null });
const loading = ref<Record<CliKind, boolean>>({ claude: false, codex: false });

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
   * The cached path is treated as if the user picked it manually: the backend
   * returns it immediately when the file still exists, skipping the slow
   * resolution path. If the cache is stale (binary moved), the override
   * silently fails the file-exists check and we drop back to a full scan.
   */
  function overrideFor(cli: CliKind): string | null {
    const manualRaw = cli === 'claude' ? settings.value.ai.cliPathClaude : settings.value.ai.cliPathCodex;
    const manual = (manualRaw ?? '').trim();
    if (manual) return manual;
    const cachedRaw = cli === 'claude'
      ? settings.value.ai.cliResolvedPathClaude
      : settings.value.ai.cliResolvedPathCodex;
    const cached = (cachedRaw ?? '').trim();
    return cached || null;
  }

  function persistResolved(cli: CliKind, status: HealthStatus) {
    if (!status.ok) return;
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
      const r = await aiCommands.healthCheck(cli, overrideFor(cli));
      cache.value[cli] = r;
      lastCheckedAt.value[cli] = Date.now();
      persistResolved(cli, r);
      return r;
    } catch (e) {
      const errStatus: HealthStatus = {
        ok: false,
        version: null,
        account: null,
        error: (e as Error)?.message ?? String(e),
      };
      cache.value[cli] = errStatus;
      lastCheckedAt.value[cli] = Date.now();
      return errStatus;
    } finally {
      loading.value[cli] = false;
    }
  }

  async function checkAll(force = false) {
    await Promise.all([check('claude', force), check('codex', force)]);
  }

  function getCached(cli: CliKind) { return cache.value[cli]; }
  function reset() {
    cache.value = { claude: null, codex: null };
    lastCheckedAt.value = { claude: null, codex: null };
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
    check, checkAll, getCached, lastCheckedAt, reset, cache, loading,
    forgetResolvedCache,
  };
}
