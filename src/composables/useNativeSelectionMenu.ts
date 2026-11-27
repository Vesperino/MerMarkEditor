import { onMounted, onScopeDispose, type InjectionKey, type Ref } from 'vue';
import { invoke, isTauri } from '@tauri-apps/api/core';
import type { UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { EditorView } from '@codemirror/view';
import { TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/vue-3';
import { isLinuxPlatform, isMacPlatform, isWindowsPlatform } from '../utils/platform';
import type { AppCommands, CommandMenu } from './useAppCommands';

export const editorSelectionMenuKey: InjectionKey<(event: MouseEvent) => boolean> = Symbol('editorSelectionMenu');

interface SelectionCommand {
  requestId: number;
  id: string;
}

function menuItems(menu: CommandMenu): object[] {
  return menu.items.map(item => 'items' in item
    ? { label: item.label, items: menuItems(item) }
    : { label: item.label, id: item.id, enabled: item.enabled, checked: item.checked });
}

function nativeMenu() {
  if (isMacPlatform()) return { command: 'prepare_macos_selection_menu', declines: false };
  if (isWindowsPlatform() || isLinuxPlatform()) return { command: 'prepare_selection_menu', declines: true };
}

export function useNativeSelectionMenu(commands: AppCommands, editor: Ref<Editor | null>) {
  const native = isTauri() ? nativeMenu() : undefined;
  if (!native) return () => false;
  const { command, declines } = native;

  const window = getCurrentWindow();
  let nextRequestId = 0;
  let pending: { id: number; restore: () => boolean } | undefined;
  let prepared: MouseEvent | undefined;
  let unlisten: UnlistenFn | undefined;
  let disposed = false;

  // The native menu of an editable selection waits until this right-click is answered.
  const decline = (event: MouseEvent) => {
    if (event === prepared || event.defaultPrevented) return;
    void invoke(command, { requestId: ++nextRequestId, groups: [] }).catch(console.error);
  };
  if (declines) {
    document.addEventListener('contextmenu', decline);
    onScopeDispose(() => document.removeEventListener('contextmenu', decline));
  }

  onMounted(async () => {
    try {
      unlisten = await window.listen<SelectionCommand>('mermark:selection-command', ({ payload }) => {
        if (pending?.id !== payload.requestId) return;
        const selection = pending;
        pending = undefined;
        if (selection.restore()) void commands.execute(payload.id).catch(console.error);
      });
      if (disposed) unlisten();
    } catch (error) {
      console.error('Could not listen for selection menu commands:', error);
    }
  });
  onScopeDispose(() => {
    disposed = true;
    unlisten?.();
  });

  return (event: MouseEvent) => {
    pending = undefined;
    if (!unlisten || event.defaultPrevented || !(event.target instanceof Element)) return false;
    const target = event.target.closest('[contenteditable]');
    if (!target || target.getAttribute('contenteditable') !== 'true') return false;

    const pos = { x: event.clientX, y: event.clientY };
    const keyboard = pos.x === 0 && pos.y === 0;
    const sourceRoot = target.closest<HTMLElement>('.code-editor .cm-editor');
    const source = sourceRoot && EditorView.findFromDOM(sourceRoot);
    const visual = editor.value;
    let restore: () => boolean;
    let inTable = false;

    if (source?.contentDOM === target) {
      const { doc, selection } = source.state;
      const offset = keyboard ? selection.main.head : source.posAtCoords(pos);
      if (offset === null || !selection.ranges.some(range => !range.empty && range.from <= offset && offset <= range.to)) return false;
      restore = () => {
        if (!target.isConnected || source.state.doc !== doc) return false;
        if (!selection.eq(source.state.selection)) source.dispatch({ selection });
        source.focus();
        return true;
      };
    } else if (visual?.isEditable && visual.view.dom === target) {
      const dom = target.ownerDocument.getSelection();
      if (!dom || dom.isCollapsed || !dom.anchorNode || !dom.focusNode ||
          !target.contains(dom.anchorNode) || !target.contains(dom.focusNode)) return false;
      // Read the visible range in case ProseMirror has yet to observe it.
      const { doc } = visual.state;
      const anchor = doc.resolve(visual.view.posAtDOM(dom.anchorNode, dom.anchorOffset));
      const head = doc.resolve(visual.view.posAtDOM(dom.focusNode, dom.focusOffset));
      const selection = TextSelection.between(anchor, head);
      if (!(selection instanceof TextSelection) || selection.empty || !doc.textBetween(selection.from, selection.to)) return false;
      const offset = keyboard ? selection.head : visual.view.posAtCoords({ left: pos.x, top: pos.y })?.pos;
      if (offset === undefined || offset < selection.from || offset > selection.to) return false;
      if (!selection.eq(visual.state.selection)) visual.view.dispatch(visual.state.tr.setSelection(selection));
      restore = () => {
        if (visual.isDestroyed || visual.state.doc !== doc) return false;
        if (!selection.eq(visual.state.selection)) visual.view.dispatch(visual.state.tr.setSelection(selection));
        visual.view.focus();
        return true;
      };
      inTable = !!event.target.closest('td, th');
    } else {
      return false;
    }

    const menus = commands.menus.value;
    const format = menus.find(item => item.id === 'format');
    if (!format?.items.some(item => 'items' in item
      ? item.items.some(child => 'enabled' in child && child.enabled)
      : item.enabled)) return false;

    const groups = [{ label: format.label, items: menuItems(format) }];
    const table = inTable && menus.find(item => item.id === 'insert')?.items.find((item): item is CommandMenu =>
      item.id === 'table' && 'items' in item);
    if (table) {
      const actions = table.items.filter(item => 'enabled' in item && item.enabled && item.id !== 'insert-table');
      if (actions.length) groups.push({ label: table.label, items: menuItems({ ...table, items: actions }) });
    }

    const requestId = ++nextRequestId;
    pending = { id: requestId, restore };
    prepared = event;
    void invoke(command, { requestId, groups }).catch(console.error);
    return true;
  };
}
