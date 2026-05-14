import type { EditorState, Transaction } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';

export type MoveBlockDirection = 'up' | 'down';

interface MovableRange {
  parentDepth: number;
  startIndex: number;
  endIndex: number; // inclusive
  rangeStart: number;
  rangeEnd: number;
  insertAnchor: number;
}

function findMovableRange(
  state: EditorState,
  direction: MoveBlockDirection
): MovableRange | null {
  const { $from, $to } = state.selection;
  const maxDepth = Math.min($from.depth, $to.depth);

  for (let d = maxDepth; d >= 1; d--) {
    const parentDepth = d - 1;
    const parent = $from.node(parentDepth);
    if (parent !== $to.node(parentDepth)) continue;

    const startIndex = $from.index(parentDepth);
    let endIndex = $to.index(parentDepth);
    // Non-empty selection ending exactly at the boundary before a child belongs
    // to the previous child (matches conventional "select-line" behaviour).
    if ($to.pos > $from.pos && endIndex > startIndex) {
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

    return { parentDepth, startIndex, endIndex, rangeStart, rangeEnd, insertAnchor };
  }
  return null;
}

export function buildMoveBlockTransaction(
  state: EditorState,
  direction: MoveBlockDirection
): Transaction | null {
  const found = findMovableRange(state, direction);
  if (!found) return null;

  const { rangeStart, rangeEnd, insertAnchor } = found;
  const slice = state.doc.slice(rangeStart, rangeEnd);

  const fromOffset = state.selection.$from.pos - rangeStart;
  const toOffset = state.selection.$to.pos - rangeStart;

  const tr = state.tr;
  tr.delete(rangeStart, rangeEnd);
  const insertPos = tr.mapping.map(insertAnchor);
  tr.insert(insertPos, slice.content);

  const docSize = tr.doc.content.size;
  const newFrom = Math.min(insertPos + fromOffset, docSize);
  const newTo = Math.min(insertPos + toOffset, docSize);
  try {
    tr.setSelection(TextSelection.create(tr.doc, newFrom, newTo));
  } catch {
    tr.setSelection(TextSelection.create(tr.doc, insertPos));
  }
  tr.scrollIntoView();
  return tr;
}
