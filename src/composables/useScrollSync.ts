/**
 * Map a scroll position on one element to the equivalent proportional position
 * on another. Returns 0 when either element has no scroll range.
 */
export function proportionalTarget(
  srcTop: number,
  srcScrollH: number,
  srcClientH: number,
  dstScrollH: number,
  dstClientH: number,
): number {
  const srcMax = srcScrollH - srcClientH;
  const dstMax = dstScrollH - dstClientH;
  if (srcMax <= 0 || dstMax <= 0) return 0;
  const ratio = Math.min(Math.max(srcTop / srcMax, 0), 1);
  return ratio * dstMax;
}

/**
 * Read an element's current vertical scroll progress in [0, 1].
 * Returns 0 when the element is missing or has no scrollable range.
 */
export function scrollRatioOf(element: HTMLElement | null): number {
  if (!element) return 0;
  const max = element.scrollHeight - element.clientHeight;
  if (max <= 0) return 0;
  return Math.min(Math.max(element.scrollTop / max, 0), 1);
}

/**
 * Convert a saved scroll ratio (0..1) back into a scrollTop for a container,
 * clamped to its current scrollable range. Returns 0 when the content fits
 * the viewport. Used to restore scroll position after content is rebuilt.
 */
export function scrollTopFromRatio(
  ratio: number,
  scrollHeight: number,
  clientHeight: number,
): number {
  const max = scrollHeight - clientHeight;
  if (max <= 0) return 0;
  return Math.round(Math.min(Math.max(ratio, 0), 1) * max);
}

const SCROLL_HOLD_QUIET_MS = 250;
const SCROLL_HOLD_MAX_MS = 2500;
const SCROLL_HOLD_CANCEL_EVENTS = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;

export interface HoldScrollRatioOptions {
  quietMs?: number;
  maxMs?: number;
}

/**
 * Re-apply a proportional scroll position across frames while newly mounted
 * editors settle their layout (e.g. images, Mermaid diagrams, CodeMirror
 * measurement). Stops once layout stays quiet, the max window expires, all
 * targets disconnect, or the user interacts with any target container.
 */
export function holdScrollRatio(
  getElements: Array<() => HTMLElement | null>,
  ratio: number,
  options: HoldScrollRatioOptions = {},
): () => void {
  const quietMs = options.quietMs ?? SCROLL_HOLD_QUIET_MS;
  const maxMs = options.maxMs ?? SCROLL_HOLD_MAX_MS;
  const started = performance.now();
  let quietSince = started;
  let frame = 0;
  let stopped = false;
  let sawConnected = false;
  const bound = new Set<HTMLElement>();
  const lastMaxScroll = new WeakMap<HTMLElement, number>();

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    for (const element of bound) {
      for (const type of SCROLL_HOLD_CANCEL_EVENTS) {
        element.removeEventListener(type, stop);
      }
    }
    bound.clear();
  };

  const step = () => {
    if (stopped) return;
    const now = performance.now();
    let anyConnected = false;
    let movedOrResized = false;

    for (const getElement of getElements) {
      const element = getElement();
      if (!element || !element.isConnected) continue;
      anyConnected = true;
      sawConnected = true;

      if (!bound.has(element)) {
        bound.add(element);
        for (const type of SCROLL_HOLD_CANCEL_EVENTS) {
          element.addEventListener(type, stop, { passive: true });
        }
      }

      const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
      const prevMax = lastMaxScroll.get(element);
      if (prevMax !== undefined && prevMax !== maxScroll) {
        movedOrResized = true;
      }
      lastMaxScroll.set(element, maxScroll);

      const target = scrollTopFromRatio(ratio, element.scrollHeight, element.clientHeight);
      if (Math.abs(element.scrollTop - target) > 1) {
        element.scrollTop = target;
        movedOrResized = true;
      }
    }

    if (sawConnected && !anyConnected) {
      stop();
      return;
    }
    if (movedOrResized) quietSince = now;
    if (now - quietSince > quietMs || now - started > maxMs) {
      stop();
      return;
    }
    frame = requestAnimationFrame(step);
  };

  step();
  return stop;
}

export interface ScrollSync {
  attach: (codeEl: HTMLElement, previewEl: HTMLElement) => void;
  detach: () => void;
}

/**
 * Bidirectional proportional scroll-sync between two scroll containers.
 * Ownership prevents asynchronously delivered programmatic scroll events from
 * bouncing back after the originating handler has completed.
 */
export function useScrollSync(): ScrollSync {
  let code: HTMLElement | null = null;
  let preview: HTMLElement | null = null;
  let owner: 'code' | 'preview' | null = null;

  const sync = (src: HTMLElement, dst: HTMLElement) => {
    const target = proportionalTarget(
      src.scrollTop, src.scrollHeight, src.clientHeight,
      dst.scrollHeight, dst.clientHeight,
    );
    if (Math.abs(target - dst.scrollTop) < 1) return;
    dst.scrollTop = target;
  };

  const onCodeIntent = () => { owner = 'code'; };
  const onPreviewIntent = () => { owner = 'preview'; };
  const onCodeScroll = () => {
    if (!code || !preview) return;
    if (owner === null) owner = 'code';
    if (owner === 'code') sync(code, preview);
  };
  const onPreviewScroll = () => {
    if (!code || !preview) return;
    if (owner === null) owner = 'preview';
    if (owner === 'preview') sync(preview, code);
  };

  const detach = () => {
    code?.removeEventListener('scroll', onCodeScroll);
    code?.removeEventListener('wheel', onCodeIntent);
    code?.removeEventListener('touchstart', onCodeIntent);
    code?.removeEventListener('pointerdown', onCodeIntent);
    preview?.removeEventListener('scroll', onPreviewScroll);
    preview?.removeEventListener('wheel', onPreviewIntent);
    preview?.removeEventListener('touchstart', onPreviewIntent);
    preview?.removeEventListener('pointerdown', onPreviewIntent);
    code = null;
    preview = null;
    owner = null;
  };

  const attach = (codeEl: HTMLElement, previewEl: HTMLElement) => {
    detach();
    code = codeEl;
    preview = previewEl;
    code.addEventListener('scroll', onCodeScroll, { passive: true });
    code.addEventListener('wheel', onCodeIntent, { passive: true });
    code.addEventListener('touchstart', onCodeIntent, { passive: true });
    code.addEventListener('pointerdown', onCodeIntent, { passive: true });
    preview.addEventListener('scroll', onPreviewScroll, { passive: true });
    preview.addEventListener('wheel', onPreviewIntent, { passive: true });
    preview.addEventListener('touchstart', onPreviewIntent, { passive: true });
    preview.addEventListener('pointerdown', onPreviewIntent, { passive: true });
  };

  return { attach, detach };
}
