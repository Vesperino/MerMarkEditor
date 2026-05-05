import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import { useAiPanelLayout } from '../../composables/useAiPanelLayout';

function setup(opts: {
  panelSide?: 'left' | 'right';
  onClose?: () => void;
  onPreviewDismiss?: () => boolean;
}) {
  const onClose = opts.onClose ?? vi.fn();
  const onPreviewDismiss = opts.onPreviewDismiss;
  const Cmp = defineComponent({
    setup(_, { expose }) {
      const api = useAiPanelLayout({
        panelSide: () => opts.panelSide ?? 'right',
        onClose,
        onPreviewDismiss,
      });
      api.mount();
      expose({ api });
      return () => h('div');
    },
    unmounted() {
      // Calling unmount via setup return value is fine; Vue will still trigger
      // composable's internal cleanup if it was registered. Here we explicitly
      // expose it so each test can call it.
    },
  });
  const w = mount(Cmp);
  return {
    wrapper: w,
    api: (w.vm as unknown as { api: ReturnType<typeof useAiPanelLayout> }).api,
    onClose,
  };
}

describe('useAiPanelLayout', () => {
  let originalRO: typeof ResizeObserver | undefined;
  beforeEach(() => {
    originalRO = (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      disconnect() {}
      unobserve() {}
    };
  });
  afterEach(() => {
    (globalThis as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver = originalRO;
  });

  it('starts not-fullscreen, not-minimized, default offset', () => {
    const { api, wrapper } = setup({});
    expect(api.fullscreen.value).toBe(false);
    expect(api.minimized.value).toBe(false);
    expect(api.topOffset.value).toBe(44);
    api.unmount();
    wrapper.unmount();
  });

  it('sideStyle right by default', () => {
    const { api, wrapper } = setup({ panelSide: 'right' });
    expect(api.sideStyle.value.right).toBe('0');
    expect(api.sideStyle.value.left).toBe('auto');
    api.unmount();
    wrapper.unmount();
  });

  it('sideStyle left when panelSide=left', () => {
    const { api, wrapper } = setup({ panelSide: 'left' });
    expect(api.sideStyle.value.left).toBe('0');
    expect(api.sideStyle.value.right).toBe('auto');
    api.unmount();
    wrapper.unmount();
  });

  it('sideStyle empty in fullscreen', () => {
    const { api, wrapper } = setup({});
    api.fullscreen.value = true;
    expect(api.sideStyle.value).toEqual({});
    api.unmount();
    wrapper.unmount();
  });

  it('Escape on body calls onClose when not fullscreen', () => {
    const onClose = vi.fn();
    const { api, wrapper } = setup({ onClose });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).toHaveBeenCalled();
    api.unmount();
    wrapper.unmount();
  });

  it('Escape exits fullscreen instead of closing', () => {
    const onClose = vi.fn();
    const { api, wrapper } = setup({ onClose });
    api.fullscreen.value = true;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(api.fullscreen.value).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    api.unmount();
    wrapper.unmount();
  });

  it('Escape from input/textarea does not close panel', () => {
    const onClose = vi.fn();
    const { api, wrapper } = setup({ onClose });
    const input = document.createElement('textarea');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
    document.body.removeChild(input);
    api.unmount();
    wrapper.unmount();
  });

  it('Escape consumed by previewDismiss skips other handlers', () => {
    const onClose = vi.fn();
    const dismiss = vi.fn().mockReturnValue(true);
    const { api, wrapper } = setup({ onClose, onPreviewDismiss: dismiss });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(dismiss).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    api.unmount();
    wrapper.unmount();
  });

  it('click outside <details> closes it', () => {
    const { api, wrapper } = setup({});
    const det = document.createElement('details');
    det.setAttribute('open', '');
    document.body.appendChild(det);
    api.setThreadsDetails(det);
    expect(det.hasAttribute('open')).toBe(true);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(det.hasAttribute('open')).toBe(false);
    document.body.removeChild(det);
    api.unmount();
    wrapper.unmount();
  });

  it('measureToolbar sets topOffset from .toolbar bottom', () => {
    const tb = document.createElement('div');
    tb.className = 'toolbar';
    Object.defineProperty(tb, 'getBoundingClientRect', { value: () => ({ bottom: 88, top: 0, left: 0, right: 0, width: 0, height: 88, x: 0, y: 0, toJSON: () => ({}) }) });
    document.body.appendChild(tb);
    const { api, wrapper } = setup({});
    api.measureToolbar();
    expect(api.topOffset.value).toBe(88);
    document.body.removeChild(tb);
    api.unmount();
    wrapper.unmount();
  });

  it('unmount removes listeners', () => {
    const onClose = vi.fn();
    const { api, wrapper } = setup({ onClose });
    api.unmount();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
