import type { EditorState, Transaction } from '@tiptap/pm/state';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

export type MoveBlockDirection = 'up' | 'down';

interface MovableRange {
  parentDepth: number;
  startIndex: number;
  endIndex: number; // inclusive
  rangeStart: number;
  rangeEnd: number;
  insertAnchor: number;
  isNodeSelection: boolean;
}

function findMovableRange(
  state: EditorState,
  direction: MoveBlockDirection
): MovableRange | null {
  const sel = state.selection;
  const { $from, $to } = sel;
  const isNodeSel = sel instanceof NodeSelection;

  // For a NodeSelection $from already sits one level above the selected node,
  // so the relevant "child index" lives at $from.depth itself. For a
  // TextSelection we must look one depth up to find the surrounding block.
  const startDepth = isNodeSel ? $from.depth + 1 : Math.min($from.depth, $to.depth);

  for (let d = startDepth; d >= 1; d--) {
    const parentDepth = d - 1;
    const parent = $from.node(parentDepth);
    if (!parent) continue;
    if (!isNodeSel && parent !== $to.node(parentDepth)) continue;

    const startIndex = $from.index(parentDepth);
    let endIndex = isNodeSel ? startIndex : $to.index(parentDepth);
    if (!isNodeSel && $to.pos > $from.pos && endIndex > startIndex) {
      const boundary = $from.posAtIndex(endIndex, parentDepth);
      if ($to.pos === boundary) endIndex -= 1;
    }

    const canMove =
      direction === 'up' ? startIndex > 0 : endIndex < parent.childCount - 1;
    if (!canMove) continue;

    const rangeStart = $from.posAtIndex(startIndex, parentDepth);
    const rangeEnd = $from.posAtIndex(endIndex + 1, parentDepth);
    const insertAnchor =
      direction === 'up'
        ? $from.posAtIndex(startIndex - 1, parentDepth)
        : $from.posAtIndex(endIndex + 2, parentDepth);

    return {
      parentDepth,
      startIndex,
      endIndex,
      rangeStart,
      rangeEnd,
      insertAnchor,
      isNodeSelection: isNodeSel,
    };
  }
  return null;
}

export function buildMoveBlockTransaction(
  state: EditorState,
  direction: MoveBlockDirection
): Transaction | null {
  const found = findMovableRange(state, direction);
  if (!found) return null;

  const { rangeStart, rangeEnd, insertAnchor, isNodeSelection } = found;
  const slice = state.doc.slice(rangeStart, rangeEnd);

  const fromOffset = state.selection.$from.pos - rangeStart;
  const toOffset = state.selection.$to.pos - rangeStart;

  const tr = state.tr;
  tr.delete(rangeStart, rangeEnd);
  const insertPos = tr.mapping.map(insertAnchor);
  tr.insert(insertPos, slice.content);
  tr.setMeta('addToHistory', true);

  const docSize = tr.doc.content.size;
  try {
    if (isNodeSelection) {
      tr.setSelection(NodeSelection.create(tr.doc, insertPos));
    } else {
      const newFrom = Math.min(insertPos + fromOffset, docSize);
      const newTo = Math.min(insertPos + toOffset, docSize);
      tr.setSelection(TextSelection.create(tr.doc, newFrom, newTo));
    }
  } catch {
    tr.setSelection(TextSelection.create(tr.doc, Math.min(insertPos, docSize)));
  }
  tr.scrollIntoView();
  return tr;
}
