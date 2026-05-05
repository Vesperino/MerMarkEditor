import { computed, ref } from 'vue';

export interface AiPanelLayoutOptions {
  panelSide: () => 'left' | 'right';
  isFullscreenInputTarget?: (target: EventTarget | null) => boolean;
  onClose: () => void;
  onPreviewDismiss?: () => boolean;
}

const DEFAULT_TOP_OFFSET = 44;

export function useAiPanelLayout(opts: AiPanelLayoutOptions) {
  const fullscreen = ref(false);
  const minimized = ref(false);
  const topOffset = ref(DEFAULT_TOP_OFFSET);

  let toolbarObserver: ResizeObserver | null = null;
  let threadsDetailsRef: HTMLDetailsElement | null = null;

  function measureToolbar() {
    const tb = document.querySelector('.toolbar');
    if (tb) {
      const rect = tb.getBoundingClientRect();
      topOffset.value = Math.ceil(rect.bottom);
    }
  }

  function setThreadsDetails(el: HTMLDetailsElement | null) {
    threadsDetailsRef = el;
  }

  function onWindowClick(e: MouseEvent) {
    const det = threadsDetailsRef;
    if (det && det.open && !det.contains(e.target as Node)) {
      det.removeAttribute('open');
    }
  }

  function onGlobalKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && opts.onPreviewDismiss && opts.onPreviewDismiss()) {
      return;
    }
    if (e.key === 'Escape' && !fullscreen.value) {
      const target = e.target as HTMLElement | null;
      const isInput = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT';
      if (!isInput) opts.onClose();
    }
    if (e.key === 'Escape' && fullscreen.value) {
      fullscreen.value = false;
    }
  }

  const sideStyle = computed<Record<string, string>>(() => {
    if (fullscreen.value) return {};
    const base = opts.panelSide() === 'left'
      ? { left: '0', right: 'auto' }
      : { right: '0', left: 'auto' };
    return { ...base, top: `${topOffset.value}px` };
  });

  const minimizedStyle = computed<Record<string, string>>(() => {
    return opts.panelSide() === 'left'
      ? { left: '0', right: 'auto', top: `${topOffset.value + 12}px` }
      : { right: '0', left: 'auto', top: `${topOffset.value + 12}px` };
  });

  function mount() {
    window.addEventListener('keydown', onGlobalKeydown);
    window.addEventListener('click', onWindowClick);
    measureToolbar();
    const tb = document.querySelector('.toolbar');
    if (tb && 'ResizeObserver' in window) {
      toolbarObserver = new ResizeObserver(measureToolbar);
      toolbarObserver.observe(tb);
    }
    window.addEventListener('resize', measureToolbar);
  }

  function unmount() {
    window.removeEventListener('keydown', onGlobalKeydown);
    window.removeEventListener('click', onWindowClick);
    window.removeEventListener('resize', measureToolbar);
    toolbarObserver?.disconnect();
    toolbarObserver = null;
  }

  return {
    fullscreen,
    minimized,
    topOffset,
    sideStyle,
    minimizedStyle,
    mount,
    unmount,
    setThreadsDetails,
    measureToolbar,
  };
}
