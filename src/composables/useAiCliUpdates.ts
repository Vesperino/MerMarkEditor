import { ref } from 'vue';
import { aiCommands } from '../services/aiCommands';

export type UpdatableCli = 'claude' | 'codex';

/** Pull the x.y.z out of "2.1.278 (Claude Code)" or "codex-cli 0.144.6". */
export function parseCliVersion(text: string | null | undefined): number[] | null {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(text ?? '');
  return match ? match.slice(1).map(Number) : null;
}

export function isOutdated(installed: string | null | undefined, latest: string | null | undefined): boolean {
  const have = parseCliVersion(installed);
  const newest = parseCliVersion(latest);
  if (!have || !newest) return false;
  const differs = have.findIndex((part, i) => part !== newest[i]);
  return differs !== -1 && have[differs] < newest[differs];
}

const latest = ref<Partial<Record<UpdatableCli, string>>>({});
const updating = ref<Partial<Record<UpdatableCli, boolean>>>({});
const updateError = ref<Partial<Record<UpdatableCli, string>>>({});
const checked = new Set<UpdatableCli>();

export function useAiCliUpdates() {
  /** Looks the newest version up once per session. */
  async function checkLatest(cli: UpdatableCli): Promise<void> {
    if (checked.has(cli)) return;
    checked.add(cli);
    try {
      latest.value = { ...latest.value, [cli]: await aiCommands.cliLatestVersion(cli) };
    } catch {
      checked.delete(cli);
    }
  }

  async function update(cli: UpdatableCli, cliPath: string | null): Promise<boolean> {
    updating.value = { ...updating.value, [cli]: true };
    updateError.value = { ...updateError.value, [cli]: '' };
    try {
      await aiCommands.cliUpdate(cli, cliPath);
      return true;
    } catch (error) {
      updateError.value = { ...updateError.value, [cli]: String(error) };
      return false;
    } finally {
      updating.value = { ...updating.value, [cli]: false };
    }
  }

  return { latest, updating, updateError, checkLatest, update };
}
