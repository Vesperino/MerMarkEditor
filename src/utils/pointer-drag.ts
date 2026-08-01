/**
 * Pure logic behind the workspace sidebar's pointer-based drag.
 *
 * The tree deliberately does NOT use HTML5 drag & drop: Tauri's native
 * drag-drop handler (needed for OS drops that carry absolute paths) revokes
 * WebView2's drop target, which takes page-internal HTML5 drags down with it.
 * Pointer events are independent of that pipeline.
 */

import { basenameOf, isAncestor, joinPath, trimTrailingSep } from './path-utils';

export interface Point {
  x: number;
  y: number;
}

/** Movement a press must exceed before it counts as a drag rather than a click. */
export const DRAG_THRESHOLD_PX = 4;

export function exceedsThreshold(start: Point, now: Point, threshold = DRAG_THRESHOLD_PX): boolean {
  return Math.hypot(now.x - start.x, now.y - start.y) >= threshold;
}

export type DragSource =
  | { kind: 'node'; path: string; nodeKind: 'file' | 'folder' }
  | { kind: 'section'; index: number };

/** What a press grabbed, or null when it must stay a plain click. */
export function resolveDragSource(target: Element | null): DragSource | null {
  if (!target) return null;
  if (target.closest('button, input, textarea, .tree-chevron')) return null;

  const row = target.closest<HTMLElement>('[data-tree-path]');
  if (row) {
    const path = row.dataset.treePath ?? '';
    if (!path) return null;
    return { kind: 'node', path, nodeKind: row.dataset.treeKind === 'folder' ? 'folder' : 'file' };
  }

  const header = target.closest<HTMLElement>('[data-section-index]');
  if (header) {
    const index = Number(header.dataset.sectionIndex);
    if (Number.isInteger(index)) return { kind: 'section', index };
  }

  return null;
}

export interface DropHit {
  nodePath: string | null;
  nodeKind: 'file' | 'folder' | null;
  paneId: string | null;
  sectionIndex: number | null;
}

const NO_HIT: DropHit = { nodePath: null, nodeKind: null, paneId: null, sectionIndex: null };

/** Every drop layer under the pointer; the caller picks the one its drag accepts. */
export function resolveDropHit(el: Element | null): DropHit {
  if (!el) return { ...NO_HIT };

  const row = el.closest<HTMLElement>('[data-tree-path]');
  const pane = el.closest<HTMLElement>('[data-pane-id]');
  const header = el.closest<HTMLElement>('[data-section-index]');
  const sectionIndex = header ? Number(header.dataset.sectionIndex) : Number.NaN;

  return {
    nodePath: row?.dataset.treePath ?? null,
    nodeKind: row ? (row.dataset.treeKind === 'folder' ? 'folder' : 'file') : null,
    paneId: pane?.dataset.paneId ?? null,
    sectionIndex: Number.isInteger(sectionIndex) ? sectionIndex : null,
  };
}

export interface MoveOp {
  from: string;
  to: string;
}

/** Rename operations for dropping `sources` into `destFolder`, skipping impossible ones. */
export function planMoves(sources: readonly string[], destFolder: string): MoveOp[] {
  if (!destFolder) return [];
  const ops: MoveOp[] = [];
  for (const from of sources) {
    if (!from) continue;
    if (isAncestor(from, destFolder)) continue;
    const name = basenameOf(from);
    if (!name) continue;
    const to = joinPath(destFolder, name);
    if (samePath(to, from)) continue;
    ops.push({ from, to });
  }
  return ops;
}

function samePath(a: string, b: string): boolean {
  return trimTrailingSep(a.replace(/\\/g, '/')) === trimTrailingSep(b.replace(/\\/g, '/'));
}

/**
 * Pixels to scroll the list by while the pointer hovers near an edge.
 * Negative scrolls up, positive down, 0 leaves it alone.
 */
export function autoScrollStep(
  pointerY: number,
  rect: { top: number; bottom: number },
  edge = 32,
  maxStep = 14,
): number {
  const fromTop = pointerY - rect.top;
  if (fromTop < edge) {
    const intensity = Math.min(1, (edge - fromTop) / edge);
    return -Math.max(1, Math.round(maxStep * intensity));
  }
  const fromBottom = rect.bottom - pointerY;
  if (fromBottom < edge) {
    const intensity = Math.min(1, (edge - fromBottom) / edge);
    return Math.max(1, Math.round(maxStep * intensity));
  }
  return 0;
}
