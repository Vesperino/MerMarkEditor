import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, h, shallowRef, reactive } from 'vue';
import { Editor } from '@tiptap/vue-3';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { history } from '@codemirror/commands';
import StarterKit from '@tiptap/starter-kit';
import { createDispatcher, useAppCommands, type AppCommand, type CommandContext, type CommandMenu } from '../../composables/useAppCommands';
import { useLayoutConfig } from '../../composables/useLayoutConfig';

const context = (): CommandContext => ({ codeView: false, splitEditor: false, splitView: false, hasDocument: true, canDiff: true, canCompare: true, diff: false, toc: false, ai: false, marp: false, marpPreview: false, modal: false });

describe('command dispatch', () => {
  it('rejects unknown, disabled and duplicate pending commands', async () => {
    let finish!: () => void;
    const run = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const command: AppCommand = { id: 'save', label: 'Save', enabled: false, run };
    const dispatch = createDispatcher(id => id === 'save' ? command : undefined);
    await dispatch('missing'); await dispatch('save');
    expect(run).not.toHaveBeenCalled();
    command.enabled = true;
    const pending = dispatch('save');
    await dispatch('save');
    expect(run).toHaveBeenCalledTimes(1);
    finish(); await pending;
  });

  it('keeps hidden commands available, targets the active editor, and respects mode/modal restrictions', async () => {
    const first = new Editor({ extensions: [StarterKit], content: '<p>First</p>' });
    const second = new Editor({ extensions: [StarterKit], content: '<p>Second</p>' });
    const editor = shallowRef<Editor | null>(first);
    const state = reactive(context());
    const settings = vi.fn();
    let commands!: ReturnType<typeof useAppCommands>;
    const wrapper = mount(defineComponent({ setup() {
      commands = useAppCommands({ editor, context: () => state, actions: { 'show-settings': settings } });
      return () => h('div');
    } }));
    const layout = useLayoutConfig();
    for (const item of layout.layoutConfig.value.placements) layout.moveItem(item.id, 'hidden');
    await commands.execute('show-settings');
    expect(settings).toHaveBeenCalledOnce();
    editor.value = second;
    second.commands.selectAll();
    await commands.execute('bold');
    expect(second.getHTML()).toContain('<strong>Second</strong>');
    expect(first.getHTML()).not.toContain('<strong>');
    state.codeView = true;
    expect(commands.enabled('bold')).toBe(false);
    await commands.execute('bold');
    expect(second.getHTML()).toContain('<strong>Second</strong>');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const code = new EditorView({ parent: host, state: EditorState.create({ doc: 'Original', extensions: [history()] }) });
    code.dispatch({ changes: { from: 8, insert: ' edit' } });
    code.focus(); commands.refresh();
    await commands.execute('undo');
    expect(code.state.doc.toString()).toBe('Original');
    expect(second.getHTML()).toContain('<strong>Second</strong>');
    code.destroy(); host.remove();
    const input = document.createElement('textarea'); document.body.appendChild(input); input.focus();
    state.codeView = false; commands.refresh();
    expect(commands.enabled('bold')).toBe(false);
    input.remove(); commands.refresh();
    state.codeView = false; state.splitEditor = true;
    expect(commands.enabled('bold')).toBe(false);
    state.splitEditor = false; state.modal = true;
    expect(commands.enabled('bold')).toBe(false);
    expect(commands.enabled('show-settings')).toBe(true);
    wrapper.unmount(); first.destroy(); second.destroy(); layout.resetToDefaults();
  });
  it('sets heading levels 1–6 without toggling them off and respects focus/mode restrictions', async () => {
    const editor = new Editor({ extensions: [StarterKit], content: '<p>Heading text</p>' });
    const state = reactive(context());
    let commands!: ReturnType<typeof useAppCommands>;
    const wrapper = mount(defineComponent({ setup() {
      commands = useAppCommands({ editor: shallowRef(editor), context: () => state, actions: {} });
      return () => h('div');
    } }));
    const flatten = (items: (AppCommand | CommandMenu)[]): AppCommand[] =>
      items.flatMap(item => 'items' in item ? flatten(item.items) : [item]);
    try {
      for (let level = 1; level <= 6; level++) {
        const command = flatten(commands.menus.value).find(item => item.id === `heading:${level}`)!;
        expect(command.accelerator).toBe(`CmdOrCtrl+${level}`);
        await commands.execute(command.id);
        expect(editor.getHTML()).toContain(`<h${level}>Heading text</h${level}>`);
        await commands.execute(command.id);
        expect(editor.isActive('heading', { level })).toBe(true);
      }
      for (const restriction of ['codeView', 'splitEditor', 'modal', 'hasDocument'] as const) {
        state[restriction] = restriction !== 'hasDocument';
        expect(commands.enabled('heading:1')).toBe(false);
        await commands.execute('heading:1');
        expect(editor.isActive('heading', { level: 6 })).toBe(true);
        state[restriction] = restriction === 'hasDocument';
      }
      const input = document.createElement('input');
      document.body.appendChild(input); input.focus(); commands.refresh();
      expect(commands.enabled('heading:1')).toBe(false);
      input.remove(); commands.refresh();
    } finally {
      wrapper.unmount(); editor.destroy();
    }
  });

});
