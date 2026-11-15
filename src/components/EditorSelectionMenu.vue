<script lang="ts">
import type { InjectionKey } from 'vue';

export const editorSelectionMenuKey: InjectionKey<(event: MouseEvent) => void> = Symbol('editorSelectionMenu');
</script>

<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watchPostEffect } from 'vue';
import { EditorView } from '@codemirror/view';
import { TextSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/vue-3';
import { useAppCommandDispatcher, type AppCommand, type CommandMenu } from '../composables/useAppCommands';

const props = defineProps<{ editor: Editor | null }>();
const commands = useAppCommandDispatcher();
const menu = ref<HTMLDivElement | null>(null);
const expanded = ref<string | null>(null);
const popup = shallowRef<{
  x: number;
  y: number;
  focusEditor: () => boolean;
  groups: (AppCommand | CommandMenu)[][];
} | null>(null);

function open(event: MouseEvent) {
  close();
  if (!commands || event.defaultPrevented || !(event.target instanceof Element)) return;
  const target = event.target.closest('[contenteditable]');
  if (!target || target.getAttribute('contenteditable') !== 'true') return;

  const point = { x: event.clientX, y: event.clientY };
  const fromKeyboard = point.x === 0 && point.y === 0;
  const browserSelection = target.ownerDocument.getSelection();
  const sourceRoot = target.closest('.code-editor .cm-editor');
  const source = sourceRoot && EditorView.findFromDOM(sourceRoot as HTMLElement);
  const visual = props.editor;
  let focusEditor: () => boolean;
  let inTable = false;

  if (source && source.contentDOM === target) {
    const { doc, selection } = source.state;
    const pos = fromKeyboard ? selection.main.head : source.posAtCoords(point);
    if (pos === null || !selection.ranges.some(range => !range.empty && range.from <= pos && pos <= range.to)) return;
    focusEditor = () => {
      if (!target.isConnected || source.state.doc !== doc) return false;
      if (!selection.eq(source.state.selection)) source.dispatch({ selection });
      source.focus();
      return true;
    };
  } else if (visual?.isEditable && visual.view.dom === target) {
    if (!browserSelection || browserSelection.isCollapsed) return;
    const { anchorNode, anchorOffset, focusNode, focusOffset } = browserSelection;
    if (!anchorNode || !focusNode || !target.contains(anchorNode) || !target.contains(focusNode)) return;

    // A right-click can arrive before ProseMirror observes the DOM selection.
    const { doc } = visual.state;
    const anchor = doc.resolve(visual.view.posAtDOM(anchorNode, anchorOffset));
    const head = doc.resolve(visual.view.posAtDOM(focusNode, focusOffset));
    const selection = TextSelection.between(anchor, head);
    if (!(selection instanceof TextSelection) || selection.empty || !doc.textBetween(selection.from, selection.to)) return;
    const pos = fromKeyboard ? selection.head : visual.view.posAtCoords({ left: point.x, top: point.y })?.pos;
    if (pos === undefined || pos < selection.from || pos > selection.to) return;
    if (!selection.eq(visual.state.selection)) visual.view.dispatch(visual.state.tr.setSelection(selection));
    focusEditor = () => {
      if (visual.isDestroyed || visual.state.doc !== doc) return false;
      if (!selection.eq(visual.state.selection)) visual.view.dispatch(visual.state.tr.setSelection(selection));
      visual.view.focus();
      return true;
    };
    inTable = !!event.target.closest('td, th');
  } else {
    return;
  }

  const menus = commands.menus.value;
  const format = menus.find(item => item.id === 'format');
  if (!format?.items.some(item => 'items' in item ? item.items.some(child => 'enabled' in child && child.enabled) : item.enabled)) return;
  const clipboard = menus.find(item => item.id === 'edit')?.items.filter(item =>
    item.id && ['cut', 'copy', 'paste', 'select-all'].includes(item.id)) ?? [];
  const table = inTable && menus.find(item => item.id === 'insert')?.items.find((item): item is CommandMenu =>
    item.id === 'table' && 'items' in item);
  const tableActions = table ? table.items.filter(item => 'enabled' in item && item.enabled && item.id !== 'insert-table') : [];
  const groups = [clipboard, format.items];
  if (table && tableActions.length) groups.push([{ ...table, items: tableActions }]);

  event.preventDefault();
  const selectionRect = fromKeyboard && browserSelection?.rangeCount ? browserSelection.getRangeAt(0).getBoundingClientRect() : undefined;
  popup.value = { x: selectionRect?.left ?? point.x, y: selectionRect?.bottom ?? point.y, focusEditor, groups };
}

defineExpose({ open });

function close(restoreFocus = false) {
  if (restoreFocus) popup.value?.focusEditor();
  popup.value = null;
  expanded.value = null;
}

function run(item: AppCommand) {
  const selection = popup.value;
  close();
  if (selection?.focusEditor()) void commands?.execute(item.id).catch(console.error);
}

function closeOutside(event: PointerEvent) {
  if (!menu.value?.contains(event.target as Node)) close();
}

function handleKey(event: KeyboardEvent) {
  if (!menu.value) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    close(true);
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const buttons = Array.from(menu.value.querySelectorAll<HTMLButtonElement>('button:enabled'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const index = event.key === 'ArrowDown' ? (current + 1) % buttons.length : current <= 0 ? buttons.length - 1 : current - 1;
    event.preventDefault();
    event.stopPropagation();
    buttons[index]?.focus();
  } else if (event.key === 'Tab') {
    close(menu.value.contains(document.activeElement));
  }
}

function positionMenu() {
  if (!menu.value || !popup.value) return;
  const { width, height } = menu.value.getBoundingClientRect();
  menu.value.style.left = `${Math.max(4, Math.min(popup.value.x, window.innerWidth - width - 4))}px`;
  menu.value.style.top = `${Math.max(4, Math.min(popup.value.y, window.innerHeight - height - 4))}px`;
}

watchPostEffect(() => {
  // Reposition after the menu renders or a group changes its height.
  void expanded.value;
  positionMenu();
});

onMounted(() => {
  document.addEventListener('pointerdown', closeOutside, true);
  window.addEventListener('keydown', handleKey, true);
  window.addEventListener('resize', positionMenu);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', closeOutside, true);
  window.removeEventListener('keydown', handleKey, true);
  window.removeEventListener('resize', positionMenu);
});
</script>

<template>
  <Teleport to="body">
    <div v-if="popup" ref="menu" class="editor-selection-menu" role="menu" @mousedown.prevent @contextmenu.prevent>
      <div v-for="(group, index) in popup.groups" :key="index" class="menu-group" role="group">
        <template v-for="item in group" :key="item.id ?? item.label">
          <template v-if="'items' in item">
            <button type="button" role="menuitem" :aria-expanded="expanded === item.label"
              @click="expanded = expanded === item.label ? null : item.label">
              {{ item.label }}<span aria-hidden="true">{{ expanded === item.label ? '▾' : '▸' }}</span>
            </button>
            <div v-if="expanded === item.label" class="submenu" role="group" :aria-label="item.label">
              <template v-for="child in item.items" :key="child.id ?? child.label">
                <button v-if="'enabled' in child" type="button" :disabled="!child.enabled"
                  :role="child.checked === undefined ? 'menuitem' : 'menuitemcheckbox'" :aria-checked="child.checked" @click="run(child)">
                  {{ child.label }}<span v-if="child.checked" aria-hidden="true">✓</span>
                </button>
              </template>
            </div>
          </template>
          <button v-else type="button" :disabled="!item.enabled"
            :role="item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'" :aria-checked="item.checked" @click="run(item)">
            {{ item.label }}<span v-if="item.checked" aria-hidden="true">✓</span>
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.editor-selection-menu {
  position: fixed;
  z-index: 10000;
  min-width: min(180px, calc(100vw - 8px));
  max-width: calc(100vw - 8px);
  max-height: calc(100vh - 8px);
  overflow: auto;
  padding: 4px;
  border: 1px solid var(--border-primary);
  border-radius: 8px;
  background: var(--dialog-bg);
  box-shadow: var(--shadow-dropdown);
}

.menu-group + .menu-group {
  border-top: 1px solid var(--border-primary);
  margin-top: 4px;
  padding-top: 4px;
}

.submenu { padding-inline-start: 12px; }

button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 6px 10px;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--text-primary);
  font-size: 13px;
  text-align: start;
  cursor: pointer;
}

button:hover:enabled,
button:focus-visible { background: var(--hover-bg); }
button:disabled { color: var(--text-faint); cursor: default; }
</style>
