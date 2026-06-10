import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AiPanelContextBar from '../../components/ai/AiPanelContextBar.vue';
import type { ContextUsage } from '../../composables/useAiContext';

function usageAt(fraction: number): ContextUsage {
  const contextWindow = 10_000;
  const totalInputTokens = Math.round(fraction * contextWindow);
  return {
    inputTokens: totalInputTokens,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 5,
    totalInputTokens,
    contextWindow,
    fraction,
    empty: false,
    freeTokens: contextWindow - totalInputTokens,
    breakdown: [
      { key: 'input', label: 'This turn input', tokens: totalInputTokens, pct: fraction * 100, color: '#2563eb' },
      { key: 'free', label: 'Free space', tokens: contextWindow - totalInputTokens, pct: (1 - fraction) * 100, color: '#e2e8f0' },
    ],
  };
}

function mountAt(fraction: number) {
  return mount(AiPanelContextBar, {
    props: { usage: usageAt(fraction), usageLabel: 'x / y' },
  });
}

describe('AiPanelContextBar', () => {
  it('shows no pressure warning below 80%', () => {
    const w = mountAt(0.5);
    expect(w.find('.ai-panel__context-warning').exists()).toBe(false);
  });

  it('shows the amber warning from 80%', () => {
    const w = mountAt(0.8);
    const warning = w.find('.ai-panel__context-warning');
    expect(warning.exists()).toBe(true);
    expect(warning.classes()).not.toContain('ai-panel__context-warning--danger');
    expect(warning.text()).toContain('Context nearly full');
  });

  it('escalates to danger styling from 95%', () => {
    const w = mountAt(0.96);
    const warning = w.find('.ai-panel__context-warning');
    expect(warning.exists()).toBe(true);
    expect(warning.classes()).toContain('ai-panel__context-warning--danger');
  });

  it('overrides segment colors with the pressure fill when warning', () => {
    const calm = mountAt(0.5).find('.ai-panel__context-seg');
    expect(calm.attributes('style')).toContain('rgb(37, 99, 235)');
    const hot = mountAt(0.9).find('.ai-panel__context-seg');
    expect(hot.attributes('style')).toContain('rgb(245, 158, 11)');
  });

  it('renders nothing when usage is empty', () => {
    const usage = { ...usageAt(0), empty: true };
    const w = mount(AiPanelContextBar, { props: { usage, usageLabel: '' } });
    expect(w.find('.ai-panel__context').exists()).toBe(false);
  });
});
