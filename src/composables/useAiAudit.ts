import { ref } from 'vue';
import { aiCommands, type AuditEntry } from '../services/aiCommands';

export function useAiAudit() {
  const entries = ref<AuditEntry[]>([]);

  async function load(since?: string, until?: string) {
    entries.value = await aiCommands.auditRead(since ?? null, until ?? null);
  }

  async function clear() {
    await aiCommands.auditClear();
    entries.value = [];
  }

  async function append(entry: AuditEntry) {
    await aiCommands.auditAppend(entry);
  }

  return { entries, load, clear, append };
}
