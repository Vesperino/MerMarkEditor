import { describe, it, expect } from 'vitest';
import {
  buildStaticPreamble,
  buildTurnContext,
  hashPreamble,
  shouldSendStaticPreamble,
  PIN_SCOPE_INSTRUCTIONS,
  type PreambleOptions,
} from '../../composables/useAiPreamble';
import type { AccessMap } from '../../services/aiCommands';

const accessMap: AccessMap = {
  readPaths: ['/r/a.md'],
  writePaths: ['/w/a.md'],
  tools: { fileRead: true, fileWrite: true, bash: false, network: false },
};

function base(): PreambleOptions {
  return {
    pins: [],
    includePins: true,
    selectionRange: null,
    accessMap,
    docPath: '/r/a.md',
    docNeedsSave: false,
    docTooLarge: false,
    sendFullDocOverride: false,
    docMarkdownLength: 1234,
    localeKey: 'en',
  };
}

describe('useAiPreamble.buildStaticPreamble', () => {
  it('contains identity, main file, paths, tools and edit directive', () => {
    const out = buildStaticPreamble(base());
    expect(out).toContain('You are an AI assistant integrated into the MerMark editor.');
    expect(out).toMatch(/Main file.*only writable target.*\/r\/a.md/);
    expect(out).toMatch(/Read paths: \/r\/a.md/);
    expect(out).toMatch(/Write paths: \/w\/a.md/);
    expect(out).toContain('USE YOUR Edit / Write TOOLS');
    expect(out).toContain('For chat-only answers');
  });

  it('serialises allowed tools from access map', () => {
    const out = buildStaticPreamble(base());
    expect(out).toMatch(/Allowed tools: fileRead,fileWrite/);
  });

  it('reports "none" when no tools enabled', () => {
    const out = buildStaticPreamble({
      ...base(),
      accessMap: { ...accessMap, tools: { fileRead: false, fileWrite: false, bash: false, network: false } },
    });
    expect(out).toMatch(/Allowed tools: none/);
  });

  it('reports "unknown" when access map is null', () => {
    const out = buildStaticPreamble({ ...base(), accessMap: null });
    expect(out).toMatch(/Allowed tools: unknown/);
  });

  it('emits unsaved main-file line when docPath is empty', () => {
    const out = buildStaticPreamble({ ...base(), docPath: '' });
    expect(out).toContain('Main file: (unsaved');
  });

  it('excludes per-turn content (pins, unsaved warning, large-doc note, mermaid)', () => {
    const out = buildStaticPreamble({
      ...base(),
      pins: [{ id: '1', text: 'hello' }],
      docNeedsSave: true,
      docTooLarge: true,
      mermaidEditMode: true,
    });
    expect(out).not.toContain('Pinned #1');
    expect(out).not.toContain('IMPORTANT: The document is not saved yet');
    expect(out).not.toMatch(/Note: the active document is large/);
    expect(out).not.toContain('MERMAID EDIT MODE');
  });

  describe('local tool providers', () => {
    it('names read_file/write_file/edit_file and the must-call instruction when localTools is set', () => {
      const out = buildStaticPreamble({ ...base(), localTools: true });
      expect(out).toContain('read_file(path)');
      expect(out).toContain('write_file(path, content)');
      expect(out).toContain('edit_file(path, old_string, new_string)');
      expect(out).toMatch(/MUST call edit_file/);
      expect(out).toMatch(/Never claim in prose that you edited/);
    });

    it('mentions list_dir for enumerating granted folders when localTools is set', () => {
      const out = buildStaticPreamble({ ...base(), localTools: true });
      expect(out).toContain('list_dir(path)');
      expect(out).toMatch(/enumerate/i);
    });

    it('does not mention list_dir for the claude/codex branch', () => {
      const out = buildStaticPreamble(base());
      expect(out).not.toContain('list_dir');
    });

    it('does not emit the CLI Edit / Write fence instruction for local providers', () => {
      const out = buildStaticPreamble({ ...base(), localTools: true });
      expect(out).not.toMatch(/USE YOUR Edit \/ Write TOOLS/);
      expect(out).not.toMatch(/Do NOT return code fences/);
    });

    it('keeps the claude/codex Edit / Write wording when localTools is unset', () => {
      const out = buildStaticPreamble(base());
      expect(out).toMatch(/USE YOUR Edit \/ Write TOOLS/);
      expect(out).not.toContain('read_file(path)');
    });

    it('instructs markdown + mermaid fences when localTools has no file tools', () => {
      const out = buildStaticPreamble({
        ...base(),
        localTools: true,
        accessMap: { ...accessMap, tools: { fileRead: false, fileWrite: false, bash: false, network: false } },
      });
      expect(out).toContain('no file tools');
      expect(out).toContain('```mermaid');
      expect(out).not.toContain('read_file(path)');
      expect(out).not.toMatch(/MUST call edit_file/);
    });

    it('treats a read-only access map as having file tools (read_file still offered)', () => {
      const out = buildStaticPreamble({
        ...base(),
        localTools: true,
        accessMap: { ...accessMap, tools: { fileRead: true, fileWrite: false, bash: false, network: false } },
      });
      expect(out).toContain('read_file(path)');
      expect(out).not.toContain('no file tools');
    });
  });

  describe('workspace context', () => {
    it('emits no workspace lines when workspaceRoot is empty', () => {
      const out = buildStaticPreamble(base());
      expect(out).not.toMatch(/Workspace:/);
      expect(out).not.toMatch(/Workspace root/);
    });

    it('emits workspace name + root + read-only guidance', () => {
      const out = buildStaticPreamble({
        ...base(),
        workspaceName: 'notes',
        workspaceRoot: '/Users/me/notes',
      });
      expect(out).toContain('Workspace: notes');
      expect(out).toContain('Workspace root (read-only context): /Users/me/notes');
      expect(out).toMatch(/only WRITE to the main file/);
    });

    it('falls back to root path when workspaceName is empty', () => {
      const out = buildStaticPreamble({
        ...base(),
        workspaceName: '',
        workspaceRoot: '/x/y',
      });
      expect(out).toContain('Workspace: /x/y');
    });
  });
});

describe('useAiPreamble.buildTurnContext', () => {
  it('returns empty string when nothing applies', () => {
    expect(buildTurnContext(base())).toBe('');
  });

  it('renders selection range when provided and no pins', () => {
    const out = buildTurnContext({ ...base(), selectionRange: { start: 10, end: 42 } });
    expect(out).toMatch(/Selection: yes \(10-42\)/);
  });

  it('renders pin block when pins included', () => {
    const out = buildTurnContext({
      ...base(),
      pins: [{ id: '1', text: 'hello' }, { id: '2', text: 'world' }],
    });
    expect(out).toContain('Pinned #1:');
    expect(out).toContain('hello');
    expect(out).toContain('Pinned #2:');
    expect(out).toContain('world');
    expect(out).toContain(PIN_SCOPE_INSTRUCTIONS.en.rule);
  });

  it('truncates long pin text at 4000 chars', () => {
    const long = 'x'.repeat(5000);
    const out = buildTurnContext({ ...base(), pins: [{ id: '1', text: long }] });
    expect(out).toContain('x'.repeat(4000) + '…');
    expect(out).not.toContain('x'.repeat(4001));
  });

  it('skips pin block when includePins=false', () => {
    const out = buildTurnContext({
      ...base(),
      pins: [{ id: '1', text: 'hello' }],
      includePins: false,
    });
    expect(out).not.toContain('Pinned #1');
  });

  it('uses Polish locale strings for pl', () => {
    const out = buildTurnContext({
      ...base(),
      pins: [{ id: '1', text: 'foo' }],
      localeKey: 'pl',
    });
    expect(out).toContain('Użytkownik załączył');
  });

  it('falls back to English for unknown locale', () => {
    const out = buildTurnContext({
      ...base(),
      pins: [{ id: '1', text: 'foo' }],
      localeKey: 'de',
    });
    expect(out).toContain('The user attached');
  });

  it('includes unsaved doc warning when docNeedsSave', () => {
    const out = buildTurnContext({ ...base(), docNeedsSave: true });
    expect(out).toContain('IMPORTANT: The document is not saved yet');
  });

  it('includes large-doc note when oversized and override off', () => {
    const out = buildTurnContext({ ...base(), docTooLarge: true, sendFullDocOverride: false });
    expect(out).toMatch(/Note: the active document is large/);
  });

  it('skips large-doc note when override on', () => {
    const out = buildTurnContext({ ...base(), docTooLarge: true, sendFullDocOverride: true });
    expect(out).not.toMatch(/Note: the active document is large/);
  });

  it('mentions configured Mermaid delimiters in Mermaid edit mode', () => {
    const out = buildTurnContext({
      ...base(),
      mermaidEditMode: true,
      mermaidWriteFormat: { id: 'admonition', open: ':::mermaid', close: ':::', label: 'Admonition', builtin: true },
    });
    expect(out).toContain('MERMAID EDIT MODE');
    expect(out).toContain(':::mermaid');
    expect(out).toContain('":::"');
  });

  it('keeps section order: pins, unsaved, large-doc, mermaid', () => {
    const out = buildTurnContext({
      ...base(),
      pins: [{ id: '1', text: 'pinned-text' }],
      docNeedsSave: true,
      docTooLarge: true,
      mermaidEditMode: true,
    });
    const order = [
      out.indexOf('Pinned #1'),
      out.indexOf('IMPORTANT: The document is not saved yet'),
      out.indexOf('Note: the active document is large'),
      out.indexOf('MERMAID EDIT MODE'),
    ];
    expect(order.every(i => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe('useAiPreamble.hashPreamble', () => {
  it('is stable for the same input and differs for different input', () => {
    expect(hashPreamble('abc')).toBe(hashPreamble('abc'));
    expect(hashPreamble('abc')).not.toBe(hashPreamble('abd'));
  });
});

describe('useAiPreamble.shouldSendStaticPreamble', () => {
  const baseGate = {
    sessionId: 's1',
    cli: 'claude' as const,
    hasImages: false,
    staticHash: 'h1',
    lastSentStaticHash: 'h1',
  };

  it('sends on fresh provider session (no sessionId)', () => {
    expect(shouldSendStaticPreamble({ ...baseGate, sessionId: null })).toBe(true);
  });

  it('skips on resumed session with unchanged hash', () => {
    expect(shouldSendStaticPreamble(baseGate)).toBe(false);
  });

  it('re-sends when the static hash changed', () => {
    expect(shouldSendStaticPreamble({ ...baseGate, staticHash: 'h2' })).toBe(true);
  });

  it('sends when no hash was ever recorded on the thread', () => {
    expect(shouldSendStaticPreamble({ ...baseGate, lastSentStaticHash: null })).toBe(true);
  });

  it('always sends for codex with images (backend forces a new session)', () => {
    expect(shouldSendStaticPreamble({ ...baseGate, cli: 'codex', hasImages: true })).toBe(true);
  });

  it('does not force-send for claude with images', () => {
    expect(shouldSendStaticPreamble({ ...baseGate, hasImages: true })).toBe(false);
  });
});
