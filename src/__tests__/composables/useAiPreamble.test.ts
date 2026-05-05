import { describe, it, expect } from 'vitest';
import { buildPreamble, PIN_SCOPE_INSTRUCTIONS, type PreambleOptions } from '../../composables/useAiPreamble';
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

describe('useAiPreamble.buildPreamble', () => {
  it('renders "Selection: none" when no pins and no range', () => {
    const out = buildPreamble(base());
    expect(out).toMatch(/Selection: none/);
  });

  it('renders "Selection: yes (a-b)" when range provided and no pins', () => {
    const out = buildPreamble({ ...base(), selectionRange: { start: 10, end: 42 } });
    expect(out).toMatch(/Selection: yes \(10-42\)/);
  });

  it('renders pin block when pins included', () => {
    const out = buildPreamble({
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
    const out = buildPreamble({ ...base(), pins: [{ id: '1', text: long }] });
    expect(out).toContain('x'.repeat(4000) + '…');
    expect(out).not.toContain('x'.repeat(4001));
  });

  it('skips pin block when includePins=false', () => {
    const out = buildPreamble({
      ...base(),
      pins: [{ id: '1', text: 'hello' }],
      includePins: false,
    });
    expect(out).not.toContain('Pinned #1');
    expect(out).toMatch(/Selection: none/);
  });

  it('uses Polish locale strings for pl', () => {
    const out = buildPreamble({
      ...base(),
      pins: [{ id: '1', text: 'foo' }],
      localeKey: 'pl',
    });
    expect(out).toContain('Użytkownik załączył');
  });

  it('falls back to English for unknown locale', () => {
    const out = buildPreamble({
      ...base(),
      pins: [{ id: '1', text: 'foo' }],
      localeKey: 'de',
    });
    expect(out).toContain('The user attached');
  });

  it('serialises allowed tools from access map', () => {
    const out = buildPreamble(base());
    expect(out).toMatch(/Allowed tools: fileRead,fileWrite/);
  });

  it('reports "none" when no tools enabled', () => {
    const out = buildPreamble({
      ...base(),
      accessMap: { ...accessMap, tools: { fileRead: false, fileWrite: false, bash: false, network: false } },
    });
    expect(out).toMatch(/Allowed tools: none/);
  });

  it('reports "unknown" when access map is null', () => {
    const out = buildPreamble({ ...base(), accessMap: null });
    expect(out).toMatch(/Allowed tools: unknown/);
  });

  it('appends unsaved doc warning when docNeedsSave', () => {
    const out = buildPreamble({ ...base(), docNeedsSave: true });
    expect(out).toContain('IMPORTANT: The document is not saved yet');
  });

  it('emits unsaved active-file line when docPath is empty', () => {
    const out = buildPreamble({ ...base(), docPath: '', docNeedsSave: true });
    expect(out).toContain('Active file: (unsaved');
  });

  it('appends large-doc note when oversized and override off', () => {
    const out = buildPreamble({ ...base(), docTooLarge: true, sendFullDocOverride: false });
    expect(out).toMatch(/Note: the active document is large/);
  });

  it('skips large-doc note when override on', () => {
    const out = buildPreamble({ ...base(), docTooLarge: true, sendFullDocOverride: true });
    expect(out).not.toMatch(/Note: the active document is large/);
  });
});
