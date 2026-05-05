import { ref } from 'vue';
import { aiCommands, type SnapshotIndexEntry } from '../services/aiCommands';

export function useAiSnapshots() {
  const items = ref<SnapshotIndexEntry[]>([]);
  const docPath = ref<string | null>(null);

  async function loadFor(path: string) {
    docPath.value = path;
    items.value = await aiCommands.snapshotList(path);
  }

  async function create(content: string, sourceSessionId: string | null, keep: number) {
    if (!docPath.value) throw new Error('No active doc');
    const entry = await aiCommands.snapshotCreate(docPath.value, content, sourceSessionId, keep);
    await loadFor(docPath.value);
    return entry;
  }

  async function restore(id: string) {
    if (!docPath.value) throw new Error('No active doc');
    return aiCommands.snapshotRestore(docPath.value, id);
  }

  async function setPinned(id: string, pinned: boolean) {
    if (!docPath.value) throw new Error('No active doc');
    await aiCommands.snapshotSetPinned(docPath.value, id, pinned);
    await loadFor(docPath.value);
  }

  async function remove(id: string) {
    if (!docPath.value) throw new Error('No active doc');
    await aiCommands.snapshotDelete(docPath.value, id);
    await loadFor(docPath.value);
  }

  async function exportTo(id: string, dest: string) {
    if (!docPath.value) throw new Error('No active doc');
    await aiCommands.snapshotExport(docPath.value, id, dest);
  }

  async function migrate(oldPath: string, newPath: string) {
    await aiCommands.snapshotMigrate(oldPath, newPath);
    if (docPath.value === oldPath) docPath.value = newPath;
  }

  return { items, docPath, loadFor, create, restore, setPinned, remove, exportTo, migrate };
}
