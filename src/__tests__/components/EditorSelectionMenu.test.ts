import { mount } from '@vue/test-utils';
import { Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { nextTick, ref } from 'vue';
import { expect, it, vi } from 'vitest';
import EditorSelectionMenu from '../../components/EditorSelectionMenu.vue';
import { appCommandsKey, type AppCommands } from '../../composables/useAppCommands';

it('formats the original DOM selection even when the editor cursor moves before invocation', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = new Editor({ element: host, extensions: [StarterKit], content: '<p>Before selected after</p>' });
  const bold = { id: 'bold', label: 'Bold', enabled: true, run: () => editor.commands.toggleBold() };
  const commands: AppCommands = {
    menus: ref([{ id: 'format', label: 'Format', items: [bold] }]),
    execute: async () => { bold.run(); },
    enabled: () => true,
  };
  const wrapper = mount(EditorSelectionMenu, {
    props: { editor },
    global: { provide: { [appCommandsKey]: commands } },
  });

  try {
    const paragraph = host.querySelector('p')!;
    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 7);
    range.setEnd(paragraph.firstChild!, 15);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    expect(editor.state.selection.empty).toBe(true);
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 10, inside: 0 });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    paragraph.addEventListener('contextmenu', wrapper.vm.open, { once: true });
    paragraph.dispatchEvent(event);
    await nextTick();
    expect(event.defaultPrevented).toBe(true);

    editor.commands.setTextSelection(1);
    document.querySelector<HTMLButtonElement>('.editor-selection-menu button')!.click();
    expect(editor.getHTML()).toBe('<p>Before <strong>selected</strong> after</p>');
  } finally {
    wrapper.unmount();
    editor.destroy();
    host.remove();
    window.getSelection()?.removeAllRanges();
  }
});
