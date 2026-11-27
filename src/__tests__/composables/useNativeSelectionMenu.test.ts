import { mount } from '@vue/test-utils';
import { Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { defineComponent, h, ref, shallowRef } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useNativeSelectionMenu } from '../../composables/useNativeSelectionMenu';
import type { AppCommands } from '../../composables/useAppCommands';

const bridge = vi.hoisted(() => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn().mockResolvedValue(vi.fn()),
  platform: { mac: true, windows: false, linux: false },
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: bridge.invoke, isTauri: () => true }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ listen: bridge.listen }) }));
vi.mock('../../utils/platform', () => ({
  isMacPlatform: () => bridge.platform.mac,
  isWindowsPlatform: () => bridge.platform.windows,
  isLinuxPlatform: () => bridge.platform.linux,
}));

const formatGroups = [{ label: 'Format', items: [{ id: 'bold', label: 'Bold', enabled: true }] }];
let cleanup: (() => void) | undefined;

beforeEach(() => {
  bridge.invoke.mockClear();
  bridge.listen.mockClear();
  bridge.platform = { mac: true, windows: false, linux: false };
});
afterEach(() => cleanup?.());

async function setup() {
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
  let open!: ReturnType<typeof useNativeSelectionMenu>;
  const wrapper = mount(defineComponent({
    setup() {
      open = useNativeSelectionMenu(commands, shallowRef(editor));
      return () => h('div');
    },
  }));
  cleanup = () => {
    wrapper.unmount();
    editor.destroy();
    host.remove();
    window.getSelection()?.removeAllRanges();
    cleanup = undefined;
  };
  await vi.waitFor(() => expect(bridge.listen).toHaveBeenCalledOnce());

  const paragraph = host.querySelector('p')!;
  const rightClickSelection = () => {
    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 7);
    range.setEnd(paragraph.firstChild!, 15);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 10, inside: 0 });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    paragraph.addEventListener('contextmenu', open, { once: true });
    paragraph.dispatchEvent(event);
    return event;
  };
  return { editor, execute, rightClickSelection };
}

function rightClickPage(prevent = false) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  if (prevent) event.preventDefault();
  document.body.dispatchEvent(event);
}

it('leaves the native menu active and applies its formatting command to the original selection', async () => {
  const { editor, execute, rightClickSelection } = await setup();
  expect(editor.state.selection.empty).toBe(true);
  const event = rightClickSelection();
  expect(event.defaultPrevented).toBe(false);
  expect(bridge.invoke).toHaveBeenCalledWith('prepare_macos_selection_menu', { requestId: 1, groups: formatGroups });

  editor.commands.setTextSelection(1);
  const receive = bridge.listen.mock.calls[0][1];
  receive({ payload: { requestId: 0, id: 'bold' } });
  expect(execute).not.toHaveBeenCalled();
  receive({ payload: { requestId: 1, id: 'bold' } });
  expect(editor.getHTML()).toBe('<p>Before <strong>selected</strong> after</p>');
});

it('leaves other right-clicks to macOS without a reply', async () => {
  await setup();
  rightClickPage();
  expect(bridge.invoke).not.toHaveBeenCalled();
});

it.each([
  ['Windows', { mac: false, windows: true, linux: false }],
  ['Linux', { mac: false, windows: false, linux: true }],
])('prepares the %s menu through the shared command and answers every other right-click', async (_, platform) => {
  bridge.platform = platform;
  const { rightClickSelection } = await setup();
  rightClickSelection();
  expect(bridge.invoke).toHaveBeenCalledOnce();
  expect(bridge.invoke).toHaveBeenCalledWith('prepare_selection_menu', { requestId: 1, groups: formatGroups });

  rightClickPage(true);
  expect(bridge.invoke).toHaveBeenCalledOnce();
  rightClickPage();
  expect(bridge.invoke).toHaveBeenLastCalledWith('prepare_selection_menu', { requestId: 2, groups: [] });
});
