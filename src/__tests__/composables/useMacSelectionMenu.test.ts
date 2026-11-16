import { mount } from '@vue/test-utils';
import { Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { defineComponent, h, ref, shallowRef } from 'vue';
import { expect, it, vi } from 'vitest';
import { useMacSelectionMenu } from '../../composables/useMacSelectionMenu';
import type { AppCommands } from '../../composables/useAppCommands';

const bridge = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke, isTauri: () => true }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ listen: bridge.listen }) }));
vi.mock('../../utils/platform', () => ({ isMacPlatform: () => true }));

it('leaves the native menu active and applies its formatting command to the original selection', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const editor = new Editor({ element: host, extensions: [StarterKit], content: '<p>Before selected after</p>' });
  const execute = vi.fn(async () => { editor.commands.toggleBold(); });
  const commands: AppCommands = {
    menus: ref([{ id: 'format', label: 'Format', items: [
      { id: 'bold', label: 'Bold', enabled: true, run: execute },
    ] }]),
    execute,
    enabled: () => true,
  };
  let open!: ReturnType<typeof useMacSelectionMenu>;
  const wrapper = mount(defineComponent({
    setup() {
      open = useMacSelectionMenu(commands, shallowRef(editor));
      return () => h('div');
    },
  }));

  try {
    await vi.waitFor(() => expect(bridge.listen).toHaveBeenCalledOnce());
    const paragraph = host.querySelector('p')!;
    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 7);
    range.setEnd(paragraph.firstChild!, 15);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    expect(editor.state.selection.empty).toBe(true);
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 10, inside: 0 });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    paragraph.addEventListener('contextmenu', open, { once: true });
    paragraph.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(bridge.invoke).toHaveBeenCalledWith('prepare_macos_selection_menu', {
      requestId: 1,
      groups: [{ label: 'Format', items: [{ id: 'bold', label: 'Bold', enabled: true }] }],
    });

    editor.commands.setTextSelection(1);
    const receive = bridge.listen.mock.calls[0][1];
    receive({ payload: { requestId: 0, id: 'bold' } });
    expect(execute).not.toHaveBeenCalled();
    receive({ payload: { requestId: 1, id: 'bold' } });
    expect(editor.getHTML()).toBe('<p>Before <strong>selected</strong> after</p>');
  } finally {
    wrapper.unmount();
    editor.destroy();
    host.remove();
    window.getSelection()?.removeAllRanges();
  }
});
