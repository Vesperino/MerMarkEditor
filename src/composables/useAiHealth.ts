import { ref } from 'vue';
import { aiCommands, type CliKind, type HealthStatus } from '../services/aiCommands';
import { useSettings } from './useSettings';

const cache = ref<Record<CliKind, HealthStatus | null>>({ claude: null, codex: null });
const lastCheckedAt = ref<Record<CliKind, number | null>>({ claude: null, codex: null });
const loading = ref<Record<CliKind, boolean>>({ claude: false, codex: false });

export function useAiHealth() {
  const { settings } = useSettings();

  function overrideFor(cli: CliKind): string | null {
    const raw = cli === 'claude' ? settings.value.ai.cliPathClaude : settings.value.ai.cliPathCodex;
    const trimmed = (raw ?? '').trim();
    return trimmed || null;
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

  return { check, checkAll, getCached, lastCheckedAt, reset, cache, loading };
}
