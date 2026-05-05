import { ref } from 'vue';
import { aiCommands, type CliKind, type HealthStatus } from '../services/aiCommands';

const cache = ref<Record<CliKind, HealthStatus | null>>({ claude: null, codex: null });
const lastCheckedAt = ref<Record<CliKind, number | null>>({ claude: null, codex: null });

export function useAiHealth() {
  async function check(cli: CliKind, force = false): Promise<HealthStatus> {
    if (!force && cache.value[cli]) {
      return cache.value[cli] as HealthStatus;
    }
    const r = await aiCommands.healthCheck(cli);
    cache.value[cli] = r;
    lastCheckedAt.value[cli] = Date.now();
    return r;
  }

  async function checkAll(force = false) {
    await Promise.all([check('claude', force), check('codex', force)]);
  }

  function getCached(cli: CliKind) { return cache.value[cli]; }
  function reset() { cache.value = { claude: null, codex: null }; lastCheckedAt.value = { claude: null, codex: null }; }

  return { check, checkAll, getCached, lastCheckedAt, reset, cache };
}
