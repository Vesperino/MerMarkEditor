import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

// The composer embeds AiSnapshotList, which loads snapshots over Tauri invoke
// on mount — stub the IPC layer so jsdom mounting stays self-contained.
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve([])),
}));

import AiPanelComposer from '../../components/ai/AiPanelComposer.vue';

function baseProps() {
  return {
    inputValue: 'hello',
    cliConnected: true,
    isSending: false,
    authRequiredHint: 'Auth required',
    emptyKeyHint: 'Ctrl+Enter to send.',
    sendButtonText: 'Send',
    cancelButtonText: 'Cancel',
    accessMapTitle: 'Access map',
    docPath: '/x/doc.md',
    docTooLarge: false,
    docMarkdownLengthKb: 1,
    sendFullDocOverride: false,
    pinnedSelections: [],
    includePinned: false,
    showLiveSelection: false,
    liveSelectionText: null as string | null,
    pinPreview: (s: string) => s,
    pendingImages: [],
    accessMap: null,
  };
}

function sendButton(w: ReturnType<typeof mount>) {
  return w.find('.ai-panel__btn--primary');
}

describe('AiPanelComposer model guard', () => {
  it('enables send when a model is selected', () => {
    const w = mount(AiPanelComposer, { props: baseProps() });
    expect(sendButton(w).attributes('disabled')).toBeUndefined();
    expect(w.text()).not.toContain('Select a model first');
  });

  it('disables send and shows the hint when the local model id is empty', () => {
    const w = mount(AiPanelComposer, { props: { ...baseProps(), modelMissing: true } });
    expect(sendButton(w).attributes('disabled')).toBeDefined();
    expect(w.find('.ai-panel__hint--warn').text()).toContain('Select a model first');
  });

  it('still disables send for empty input even without the guard', () => {
    const w = mount(AiPanelComposer, { props: { ...baseProps(), inputValue: '' } });
    expect(sendButton(w).attributes('disabled')).toBeDefined();
  });
});
