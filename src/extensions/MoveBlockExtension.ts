import { Extension } from '@tiptap/core';
import { buildMoveBlockTransaction, type MoveBlockDirection } from './move-block/moveBlock';

function move(editor: { state: any; view: { dispatch: (tr: any) => void } }, direction: MoveBlockDirection): boolean {
  const tr = buildMoveBlockTransaction(editor.state, direction);
  if (!tr) return false;
  editor.view.dispatch(tr);
  return true;
}

export const MoveBlockExtension = Extension.create({
  name: 'moveBlock',

  addKeyboardShortcuts() {
    return {
      'Alt-ArrowUp': ({ editor }) => move(editor as any, 'up'),
      'Alt-ArrowDown': ({ editor }) => move(editor as any, 'down'),
    };
  },
});
