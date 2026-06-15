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

export interface ScrollSync {
  attach: (codeEl: HTMLElement, previewEl: HTMLElement) => void;
  detach: () => void;
}

/**
 * Bidirectional proportional scroll-sync between two scroll containers.
 * A shared lock plus a requestAnimationFrame release prevents the programmatic
 * scroll of one side from bouncing back through the other side's scroll event.
 */
export function useScrollSync(): ScrollSync {
  let code: HTMLElement | null = null;
  let preview: HTMLElement | null = null;
  let lock = false;

  const sync = (src: HTMLElement, dst: HTMLElement) => {
    if (lock) return;
    lock = true;
    dst.scrollTop = proportionalTarget(
      src.scrollTop, src.scrollHeight, src.clientHeight,
      dst.scrollHeight, dst.clientHeight,
    );
    requestAnimationFrame(() => { lock = false; });
  };

  const onCodeScroll = () => { if (code && preview) sync(code, preview); };
  const onPreviewScroll = () => { if (code && preview) sync(preview, code); };

  const detach = () => {
    code?.removeEventListener('scroll', onCodeScroll);
    preview?.removeEventListener('scroll', onPreviewScroll);
    code = null;
    preview = null;
    lock = false;
  };

  const attach = (codeEl: HTMLElement, previewEl: HTMLElement) => {
    detach();
    code = codeEl;
    preview = previewEl;
    code.addEventListener('scroll', onCodeScroll, { passive: true });
    preview.addEventListener('scroll', onPreviewScroll, { passive: true });
  };

  return { attach, detach };
}
