import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AiPanelHeader from '../../components/ai/AiPanelHeader.vue';
import { CUSTOM_MODEL_SENTINEL } from '../../composables/useAiModels';
import type { CliKind } from '../../services/aiCommands';

function baseProps() {
  return {
    cli: 'claude' as CliKind,
    availableClis: ['claude', 'codex'] as CliKind[],
    model: 'claude-sonnet-4-6',
    modelOptions: [
      { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
      { id: CUSTOM_MODEL_SENTINEL, label: 'Custom…', custom: true },
    ],
    effort: 'medium',
    effortOptions: [{ id: 'medium', label: 'Medium' }, { id: 'low', label: 'Low' }],
    customModelInput: '',
    isCustomModel: false,
    cliConnected: true,
    cliAccount: 'demo@x.io',
    threads: [],
    activeThreadId: null,
    fullscreen: false,
    titleText: 'AI',
    statusOkLabel: (a: string) => `OK ${a}`,
    statusAuthLabel: 'Auth',
    modelTitle: 'Model',
    defaultCliTitle: 'CLI',
    fullscreenTitle: 'FS',
    exitFullscreenTitle: 'Exit FS',
    closeTitle: 'Close',
    newChatTitle: 'New chat',
  };
}

describe('AiPanelHeader', () => {
  it('shows OK status dot when connected', () => {
    const w = mount(AiPanelHeader, { props: baseProps() });
    expect(w.find('.ai-panel__status-dot--ok').exists()).toBe(true);
  });

  it('shows error status dot when not connected', () => {
    const w = mount(AiPanelHeader, { props: { ...baseProps(), cliConnected: false } });
    expect(w.find('.ai-panel__status-dot--err').exists()).toBe(true);
  });

  it('emits update:cli when CLI dropdown changes', async () => {
    const w = mount(AiPanelHeader, { props: baseProps() });
    const select = w.findAll('select')[0];
    await select.setValue('codex');
    expect(w.emitted('update:cli')?.[0]).toEqual(['codex']);
  });

  it('emits update:model on plain model option select', async () => {
    const w = mount(AiPanelHeader, { props: baseProps() });
    const modelSelect = w.findAll('select')[1];
    await modelSelect.setValue('claude-sonnet-4-6');
    expect(w.emitted('update:model')?.[0]).toEqual(['claude-sonnet-4-6']);
  });

  it('emits minimize, toggleFullscreen, close on window buttons', async () => {
    const w = mount(AiPanelHeader, { props: baseProps() });
    const btns = w.findAll('.ai-panel__win-btn');
    await btns[0].trigger('click');
    await btns[1].trigger('click');
    await btns[2].trigger('click');
    expect(w.emitted('minimize')).toBeTruthy();
    expect(w.emitted('toggleFullscreen')).toBeTruthy();
    expect(w.emitted('close')).toBeTruthy();
  });

  it('emits revert and newChat on action buttons', async () => {
    const w = mount(AiPanelHeader, { props: baseProps() });
    const actions = w.findAll('.ai-panel__actions .ai-panel__icon-btn');
    await actions[0].trigger('click');
    await actions[actions.length - 1].trigger('click');
    expect(w.emitted('revert')).toBeTruthy();
    expect(w.emitted('newChat')).toBeTruthy();
  });

  it('renders custom model input when isCustomModel=true', () => {
    const w = mount(AiPanelHeader, { props: { ...baseProps(), isCustomModel: true, customModelInput: 'foo' } });
    expect(w.find('.ai-panel__select--custom').exists()).toBe(true);
    expect((w.find('.ai-panel__select--custom').element as HTMLInputElement).value).toBe('foo');
  });
});
