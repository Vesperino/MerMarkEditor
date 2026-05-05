import { ref } from 'vue';
import { aiCommands, type CliKind, type SessionMapping } from '../services/aiCommands';

async function sha1Hex(content: string): Promise<string> {
  const buf = new TextEncoder().encode(content);
  const hash = await crypto.subtle.digest('SHA-1', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function useAiSession() {
  const current = ref<SessionMapping | null>(null);

  async function loadFor(docPath: string) {
    current.value = await aiCommands.sessionGet(docPath);
  }

  async function startNew() { current.value = null; }

  async function persistFromResponse(opts: {
    docPath: string;
    cli: CliKind;
    sessionId: string;
    docContent: string;
  }) {
    const mapping: SessionMapping = {
      docPath: opts.docPath,
      cli: opts.cli,
      sessionId: opts.sessionId,
      lastUsed: new Date().toISOString(),
      contentHash: await sha1Hex(opts.docContent),
    };
    await aiCommands.sessionUpsert(mapping);
    current.value = mapping;
  }

  async function tryRecover(docContent: string, cli: CliKind) {
    const hash = await sha1Hex(docContent);
    return aiCommands.sessionRecoverByHash(hash, cli);
  }

  async function migrate(oldPath: string, newPath: string) {
    await aiCommands.sessionMigrate(oldPath, newPath);
    if (current.value?.docPath === oldPath) current.value = { ...current.value, docPath: newPath };
  }

  async function clear(docPath: string) {
    await aiCommands.sessionRemove(docPath);
    current.value = null;
  }

  return { current, loadFor, startNew, persistFromResponse, tryRecover, migrate, clear, sha1Hex };
}
