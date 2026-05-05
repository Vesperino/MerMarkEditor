import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AiPanelPinList from '../../components/ai/AiPanelPinList.vue';
import type { PinnedItem } from '../../composables/useAiPinnedSelections';

const pins: PinnedItem[] = [
  { id: 'a', text: 'alpha', createdAt: '2026-05-05T00:00:00.000Z' },
  { id: 'b', text: 'beta', createdAt: '2026-05-05T00:00:01.000Z' },
];

const preview = (s: string, max = 100) => s.length > max ? s.slice(0, max) + '…' : s;

function baseProps() {
  return {
    pins,
    includePinned: true,
    showLive: false,
    liveText: null as string | null,
    preview,
  };
}

describe('AiPanelPinList', () => {
  it('renders one row per pin and shows count label', () => {
    const w = mount(AiPanelPinList, { props: baseProps() });
    expect(w.findAll('.ai-panel__pin-item')).toHaveLength(2);
    expect(w.text()).toContain('2 pinned');
  });

  it('does not render when no pins and no live', () => {
    const w = mount(AiPanelPinList, { props: { ...baseProps(), pins: [] } });
    expect(w.find('.ai-panel__pinned').exists()).toBe(false);
  });

  it('emits remove with pin id on × click', async () => {
    const w = mount(AiPanelPinList, { props: baseProps() });
    await w.findAll('.ai-panel__pin-rm')[0].trigger('click');
    expect(w.emitted('remove')?.[0]).toEqual(['a']);
  });

  it('emits clearAll on Clear button', async () => {
    const w = mount(AiPanelPinList, { props: baseProps() });
    await w.find('.ai-panel__pinned-action--clear').trigger('click');
    expect(w.emitted('clearAll')).toBeTruthy();
  });

  it('emits update:includePinned on toggle change', async () => {
    const w = mount(AiPanelPinList, { props: baseProps() });
    const cb = w.find('input[type="checkbox"]');
    (cb.element as HTMLInputElement).checked = false;
    await cb.trigger('change');
    expect(w.emitted('update:includePinned')?.[0]).toEqual([false]);
  });

  it('shows live block when showLive=true', () => {
    const w = mount(AiPanelPinList, { props: { ...baseProps(), showLive: true, liveText: 'live-bit' } });
    expect(w.find('.ai-panel__pin-live').exists()).toBe(true);
    expect(w.text()).toContain('live-bit');
  });

  it('emits pin event on + Pin button click', async () => {
    const w = mount(AiPanelPinList, { props: { ...baseProps(), pins: [], showLive: true, liveText: 'x' } });
    await w.find('.ai-panel__pinned-action').trigger('click');
    expect(w.emitted('pin')).toBeTruthy();
  });
});
