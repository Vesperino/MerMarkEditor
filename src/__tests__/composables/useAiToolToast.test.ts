import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useAiToolToast } from '../../composables/useAiToolToast';

function mountToast(durationMs?: number) {
  const Cmp = defineComponent({
    setup(_, { expose }) {
      const api = useAiToolToast(durationMs);
      expose({ api });
      return () => h('div');
    },
  });
  const w = mount(Cmp);
  return {
    wrapper: w,
    api: (w.vm as unknown as { api: ReturnType<typeof useAiToolToast> }).api,
  };
}

describe('useAiToolToast', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('sets toolActivity on trigger', () => {
    const { api } = mountToast();
    api.trigger('Edit');
    expect(api.toolActivity.value).toBe('Edit');
  });

  it('auto-clears after duration', () => {
    const { api } = mountToast(1000);
    api.trigger('Read');
    expect(api.toolActivity.value).toBe('Read');
    vi.advanceTimersByTime(1001);
    expect(api.toolActivity.value).toBe(null);
  });

  it('second trigger resets the timer', () => {
    const { api } = mountToast(1000);
    api.trigger('Edit');
    vi.advanceTimersByTime(800);
    api.trigger('Read');
    vi.advanceTimersByTime(800);
    expect(api.toolActivity.value).toBe('Read');
    vi.advanceTimersByTime(300);
    expect(api.toolActivity.value).toBe(null);
  });

  it('clear() empties value and cancels timer', () => {
    const { api } = mountToast(1000);
    api.trigger('Edit');
    api.clear();
    expect(api.toolActivity.value).toBe(null);
    vi.advanceTimersByTime(2000);
    expect(api.toolActivity.value).toBe(null);
  });

  it('unmount cancels pending timer', () => {
    const { wrapper, api } = mountToast(1000);
    api.trigger('Edit');
    wrapper.unmount();
    vi.advanceTimersByTime(2000);
    expect(api.toolActivity.value).toBe(null);
  });
});
