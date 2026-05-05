import { ref } from 'vue';
import { aiCommands, type AccessMap } from '../services/aiCommands';

export function useAiAccessMap() {
  const current = ref<AccessMap | null>(null);
  const docPath = ref<string | null>(null);

  async function loadFor(path: string) {
    docPath.value = path;
    current.value = await aiCommands.accessLoad(path);
  }

  async function save(map: AccessMap) {
    if (!docPath.value) throw new Error('No active doc');
    await aiCommands.accessSave(docPath.value, map);
    current.value = map;
  }

  async function migrate(oldPath: string, newPath: string) {
    await aiCommands.accessMigrate(oldPath, newPath);
    if (docPath.value === oldPath) docPath.value = newPath;
  }

  return { current, docPath, loadFor, save, migrate };
}
