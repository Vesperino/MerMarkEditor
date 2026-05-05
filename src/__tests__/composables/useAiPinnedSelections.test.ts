import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';
import { useAiPinnedSelections } from '../../composables/useAiPinnedSelections';

vi.stubGlobal('crypto', {
  randomUUID: (() => {
    let n = 0;
    return () => `id-${++n}`;
  })(),
});

function setup(initialLive: string | null = null) {
  const liveSelectionText = ref<string | null>(initialLive);
  const api = useAiPinnedSelections({ liveSelectionText });
  return { liveSelectionText, api };
}

describe('useAiPinnedSelections', () => {
  it('starts empty, includePinned=true', () => {
    const { api } = setup();
    expect(api.pinnedSelections.value).toEqual([]);
    expect(api.includePinned.value).toBe(true);
    expect(api.attachmentModal.value).toBe(null);
  });

  it('pins current live selection', () => {
    const { liveSelectionText, api } = setup();
    liveSelectionText.value = 'hello';
    api.pinCurrentSelection();
    expect(api.pinnedSelections.value).toHaveLength(1);
    expect(api.pinnedSelections.value[0].text).toBe('hello');
  });

  it('does not pin when live selection is empty', () => {
    const { api } = setup();
    api.pinCurrentSelection();
    expect(api.pinnedSelections.value).toHaveLength(0);
  });

  it('dedupes pins with identical text', () => {
    const { liveSelectionText, api } = setup();
    liveSelectionText.value = 'foo';
    api.pinCurrentSelection();
    api.pinCurrentSelection();
    expect(api.pinnedSelections.value).toHaveLength(1);
  });

  it('removePin removes by id', () => {
    const { liveSelectionText, api } = setup();
    liveSelectionText.value = 'a';
    api.pinCurrentSelection();
    const id = api.pinnedSelections.value[0].id;
    api.removePin(id);
    expect(api.pinnedSelections.value).toHaveLength(0);
  });

  it('clearAllPins empties list', () => {
    const { liveSelectionText, api } = setup();
    liveSelectionText.value = 'a';
    api.pinCurrentSelection();
    liveSelectionText.value = 'b';
    api.pinCurrentSelection();
    api.clearAllPins();
    expect(api.pinnedSelections.value).toHaveLength(0);
  });

  it('showLiveSelection true when live differs from all pins', () => {
    const { api } = setup('fresh');
    expect(api.showLiveSelection.value).toBe(true);
  });

  it('showLiveSelection false when live matches an existing pin', () => {
    const { liveSelectionText, api } = setup();
    liveSelectionText.value = 'same';
    api.pinCurrentSelection();
    expect(api.showLiveSelection.value).toBe(false);
  });

  it('showLiveSelection false when live is empty', () => {
    const { api } = setup(null);
    expect(api.showLiveSelection.value).toBe(false);
  });

  it('previewOf truncates and appends ellipsis', () => {
    const { api } = setup();
    expect(api.previewOf('x'.repeat(120), 10)).toBe('xxxxxxxxxx…');
    expect(api.previewOf('short')).toBe('short');
  });

  it('openAttachment sets modal, closeAttachment clears it', () => {
    const { api } = setup();
    api.openAttachment([{ id: '1', text: 'a' }]);
    expect(api.attachmentModal.value).toEqual([{ id: '1', text: 'a' }]);
    api.closeAttachment();
    expect(api.attachmentModal.value).toBe(null);
  });

  it('pinCurrentSelection re-enables includePinned even if turned off', () => {
    const { liveSelectionText, api } = setup();
    api.includePinned.value = false;
    liveSelectionText.value = 'x';
    api.pinCurrentSelection();
    expect(api.includePinned.value).toBe(true);
  });
});
