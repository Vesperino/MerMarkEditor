import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../composables/useAiSnapshots', () => ({
  useAiSnapshots: () => ({
    loadFor: vi.fn(),
    create: vi.fn(),
  }),
}));

import { useAiApply } from '../../composables/useAiApply';

describe('useAiApply.prepare', () => {
  beforeEach(() => vi.clearAllMocks());

  const ctx = {
    docPath: '/doc.md',
    currentContent: 'AAA BBB CCC',
    selectionRange: { start: 4, end: 7 }, // selects "BBB"
    sessionId: null,
    snapshotsKeep: 3,
  };

  it('replace with selection inserts payload at the selection range', async () => {
    const { prepare } = useAiApply();
    const r = await prepare({ kind: 'replace', text: '', payload: 'XYZ' }, ctx);
    expect(r.ok).toBe(true);
    expect(r.newContent).toBe('AAA XYZ CCC');
  });

  it('replace without selection swaps the whole doc', async () => {
    const { prepare } = useAiApply();
    const r = await prepare({ kind: 'replace', text: '', payload: 'NEW DOC' }, { ...ctx, selectionRange: null });
    expect(r.ok).toBe(true);
    expect(r.newContent).toBe('NEW DOC');
  });

  it('plain output returns ok:false with reason no-fence', async () => {
    const { prepare } = useAiApply();
    const r = await prepare({ kind: 'plain', text: 'just chat' }, ctx);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-fence');
  });

  it('patch with bad context falls back to full replace', async () => {
    const { prepare } = useAiApply();
    const badPatch = `--- a\n+++ b\n@@ -1,1 +1,1 @@\n-NOT IN DOC\n+REPLACEMENT\n`;
    const r = await prepare({ kind: 'patch', text: '', payload: badPatch }, { ...ctx, selectionRange: null });
    expect(r.ok).toBe(true);
    expect(r.fellBackToFullReplace).toBe(true);
  });
});
