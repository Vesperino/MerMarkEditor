// ponytail: pure offset math extracted from TableOfContents so it can be unit
// tested without a DOM. Returns the scrollTop that places `target` exactly
// `offset` px below the top of `container`, clamped to a valid (>=0) position.
export function targetScrollTop(
  containerTop: number,
  targetTop: number,
  currentScrollTop: number,
  offset: number,
): number {
  return Math.max(0, targetTop - containerTop + currentScrollTop - offset);
}
