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
