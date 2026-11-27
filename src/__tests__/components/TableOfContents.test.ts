import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h, nextTick, ref, shallowRef } from 'vue';
import { Editor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import TableOfContents from '../../components/TableOfContents.vue';

let wrapper: VueWrapper;
const editors: Editor[] = [];

function makeEditor(content: string) {
  const container = document.createElement('div');
  container.className = 'editor-container';
  const element = document.createElement('div');
  element.className = 'editor-content';
  container.append(element);
  document.body.append(container);
  container.scrollTo = vi.fn();
  const editor = new Editor({ element, extensions: [StarterKit, TableKit], content });
  editors.push(editor);
  return editor;
}

async function mountIndex(content = '<h1>Overview</h1><p>Introduction</p><h2>Details</h2>') {
  const editor = makeEditor(content);
  wrapper = mount(TableOfContents, { props: { floating: true, editorInstance: editor }, attachTo: document.body });
  await nextTick();
  return editor;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
afterEach(() => {
  wrapper?.unmount();
  editors.splice(0).forEach(editor => editor.destroy());
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('floating document index', () => {
  it('opens after hover intent, stays open when entering the flyout, and dismisses on departure', async () => {
    await mountIndex();
    const root = wrapper.find('.editor-index');
    const trigger = wrapper.find('.index-trigger');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(wrapper.find('.index-flyout').attributes('inert')).toBeDefined();
    await root.trigger('pointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(119);
    expect(trigger.attributes('aria-expanded')).toBe('false');
    await vi.advanceTimersByTimeAsync(1);
    expect(trigger.attributes('aria-expanded')).toBe('true');
    await root.trigger('pointerleave', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(100);
    await root.trigger('pointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(220);
    expect(trigger.attributes('aria-expanded')).toBe('true');
    await root.trigger('pointerleave', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(220);
    expect(trigger.attributes('aria-expanded')).toBe('false');
  });

  it('supports keyboard entry, Escape, click toggling, and outside dismissal', async () => {
    await mountIndex();
    const trigger = wrapper.find('.index-trigger');
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    expect(document.activeElement?.textContent).toContain('Overview');
    await wrapper.find('.toc-item').trigger('keydown', { key: 'Escape' });
    expect(document.activeElement).toBe(trigger.element);
    expect(trigger.attributes('aria-expanded')).toBe('false');
    await trigger.trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await nextTick();
    expect(trigger.attributes('aria-expanded')).toBe('false');
  });

  it('dismisses a hover-open index with Escape while focus stays in the editor', async () => {
    const editor = await mountIndex('<h1>Overview</h1><p>Body</p>');
    editor.view.dom.focus();
    await wrapper.find('.editor-index').trigger('pointerenter', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(120);
    const trigger = wrapper.find('.index-trigger');
    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(editor.view.dom);

    editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it('keeps focused rows available after pointer departure and returns focus after navigation', async () => {
    await mountIndex();
    const trigger = wrapper.find('.index-trigger');
    await trigger.trigger('keydown', { key: 'ArrowDown' });
    expect(document.activeElement).toBe(wrapper.find('.toc-item').element);

    await wrapper.find('.editor-index').trigger('pointerleave', { pointerType: 'mouse' });
    await vi.advanceTimersByTimeAsync(220);
    expect(trigger.attributes('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(wrapper.find('.toc-item').element);
    await wrapper.find('.toc-item').trigger('click');
    expect(trigger.attributes('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger.element);
  });

  it('prevents pointer navigation from transferring editor focus', async () => {
    const editor = await mountIndex('<h1>Overview</h1><h2>Details</h2><p>Body</p>');
    editor.view.dom.focus();
    await wrapper.find('.index-trigger').trigger('click');
    const target = wrapper.findAll('.toc-item')[1];
    const press = new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true });
    target.element.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    await target.trigger('click');
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it('preserves focus in a neighboring editor while scrolling this pane', async () => {
    const other = makeEditor('<h1>Other pane</h1><p>Body</p>');
    await mountIndex();
    other.view.dom.focus();
    await wrapper.find('.index-trigger').trigger('click');
    const target = wrapper.findAll('.toc-item')[1];
    const press = new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true });
    target.element.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
    await target.trigger('click');
    expect(document.activeElement).toBe(other.view.dom);
  });

  it('uses its own pane editor, updates renamed headings, and navigates without changing content', async () => {
    const other = makeEditor('<h1>Other pane</h1>');
    const own = makeEditor('<h1>My pane</h1><h2>Target</h2>');
    wrapper = mount(TableOfContents, {
      props: { floating: true, editorInstance: own },
      global: { provide: { editor: shallowRef(other) } },
      attachTo: document.body,
    });
    await nextTick();
    const ownContainer = own.view.dom.closest('.editor-container')!;
    const otherContainer = other.view.dom.closest('.editor-container')!;
    const heading = own.view.dom.querySelector('h2')!;
    heading.getBoundingClientRect = () => ({ top: 250 }) as DOMRect;
    const before = own.getHTML();
    const ownSelection = own.state.selection;
    expect(before).toBe('<h1>My pane</h1><h2>Target</h2>');
    const onTransaction = vi.fn();
    own.on('transaction', onTransaction);
    await wrapper.find('.index-trigger').trigger('click');
    expect(wrapper.text()).not.toContain('Other pane');
    await wrapper.findAll('.toc-item')[1].trigger('click');
    expect(ownContainer.scrollTo).toHaveBeenCalledWith({ top: 170, behavior: 'auto' });
    expect(otherContainer.scrollTo).not.toHaveBeenCalled();
    expect(onTransaction).not.toHaveBeenCalled();
    expect(own.state.selection.eq(ownSelection)).toBe(true);
    expect(own.getHTML()).toBe(before);
    expect(wrapper.find('.index-trigger').attributes('aria-expanded')).toBe('false');
    own.commands.setContent('<h1>Renamed</h1>');
    await nextTick();
    await wrapper.find('.index-trigger').trigger('click');
    expect(wrapper.findAll('.toc-item')).toHaveLength(1);
    expect(wrapper.text()).toContain('Renamed');
  });

  it('hides for headingless documents and bounds the rail for long documents', async () => {
    const editor = await mountIndex('<p>No headings yet</p>');
    expect(wrapper.find('.editor-index').isVisible()).toBe(false);
    editor.commands.setContent(Array.from({ length: 100 }, (_, i) => `<h2>Section ${i}</h2>`).join(''));
    await nextTick();
    expect(wrapper.find('.editor-index').isVisible()).toBe(true);
    expect(wrapper.findAll('.index-mark')).toHaveLength(18);
    expect(wrapper.findAll('.toc-item')).toHaveLength(0);
    await wrapper.find('.index-trigger').trigger('click');
    expect(wrapper.findAll('.toc-item')).toHaveLength(100);
  });

  it('positions the rail beside the rendered page and clamps it inside the scrollbar', async () => {
    const observe = vi.fn();
    let notifyResize = () => {};
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { notifyResize = callback; }
      observe = observe;
      disconnect() {}
    });

    const editor = makeEditor('<h1>Overview</h1>');
    const container = editor.view.dom.closest<HTMLElement>('.editor-container')!;
    const page = editor.view.dom.closest<HTMLElement>('.editor-content')!;
    let clientWidth = 790;
    Object.defineProperties(container, {
      clientLeft: { value: 2 },
      clientWidth: { get: () => clientWidth },
    });
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 800, 600));
    const pageRect = vi.spyOn(page, 'getBoundingClientRect').mockReturnValue(new DOMRect(360, 20, 280, 580));

    wrapper = mount(TableOfContents, { props: { floating: true, editorInstance: editor }, attachTo: document.body });
    const rail = wrapper.get<HTMLElement>('.editor-index').element;
    vi.spyOn(rail.parentElement!, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 800, 600));
    await vi.advanceTimersByTimeAsync(0);

    expect(observe).toHaveBeenCalledWith(container);
    expect(observe).toHaveBeenCalledWith(page, { box: 'border-box' });
    // The rail starts 8 px past the page edge, with the remaining space to its right.
    expect(rail.style.getPropertyValue('--editor-index-inset')).toBe('216px');

    pageRect.mockReturnValue(new DOMRect(102, 0, 790, 600));
    notifyResize();
    await nextTick();
    // Keep 14 px clear inside the usable viewport, before the 8 px classic track.
    expect(rail.style.getPropertyValue('--editor-index-inset')).toBe('22px');

    clientWidth = 798;
    pageRect.mockReturnValue(new DOMRect(102, 0, 798, 600));
    notifyResize();
    await nextTick();
    expect(rail.style.getPropertyValue('--editor-index-inset')).toBe('14px');
  });

  it('attaches to an initially detached TipTap editor and tracks headings added after mount', async () => {
    const observe = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      observe = observe;
      disconnect() {}
    });
    const editor = new Editor({ extensions: [StarterKit], content: '<p></p>' });
    editors.push(editor);
    const contentReady = ref(false);
    const Pane = defineComponent({
      setup: () => () => h('div', [
        h('div', { class: 'editor-container' }, contentReady.value
          ? [h(EditorContent, { class: 'editor-content', editor })]
          : []),
        h(TableOfContents, { floating: true, editorInstance: editor }),
      ]),
    });
    wrapper = mount(Pane, { attachTo: document.body });
    await nextTick();
    await nextTick();
    expect(editor.view.dom.isConnected).toBe(false);

    contentReady.value = true;
    await nextTick();
    await nextTick();
    expect(editor.view.dom.isConnected).toBe(true);
    await vi.advanceTimersByTimeAsync(32);
    expect(observe).toHaveBeenCalledWith(wrapper.get('.editor-container').element);
    expect(observe).toHaveBeenCalledWith(wrapper.get('.editor-content').element, { box: 'border-box' });

    editor.commands.setContent('<h1>Pasted section</h1><p>Body</p>');
    await vi.advanceTimersByTimeAsync(32);
    expect(wrapper.find('.index-mark.active').exists()).toBe(true);
  });

  it('tracks the visible section as its own editor scrolls', async () => {
    const editor = await mountIndex();
    const container = editor.view.dom.closest('.editor-container')!;
    Object.defineProperties(container, { clientHeight: { value: 200 }, scrollHeight: { value: 1000 } });
    const headings = editor.view.dom.querySelectorAll('h1, h2');
    headings[0].getBoundingClientRect = () => ({ top: -100 }) as DOMRect;
    headings[1].getBoundingClientRect = () => ({ top: 300 }) as DOMRect;
    container.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(32);
    await wrapper.find('.index-trigger').trigger('click');
    expect(wrapper.find('[aria-current="location"]').text()).toContain('Overview');
    headings[1].getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
    container.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(32);
    expect(wrapper.find('[aria-current="location"]').text()).toContain('Details');
  });

  it('measures only a logarithmic subset of headings while the index is closed', async () => {
    const editor = await mountIndex(Array.from({ length: 128 }, (_, i) => `<h2>Section ${i}</h2>`).join(''));
    const container = editor.view.dom.closest('.editor-container')!;
    let measures = 0;
    editor.view.dom.querySelectorAll('h2').forEach((heading, i) => {
      heading.getBoundingClientRect = () => {
        measures++;
        return { top: 100 * (i - 42) } as DOMRect;
      };
    });
    container.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(32);
    expect(measures).toBeGreaterThan(0);
    expect(measures).toBeLessThanOrEqual(8);

    await wrapper.find('.index-trigger').trigger('click');
    expect(wrapper.find('[aria-current="location"]').text()).toContain('Section 42');
  });

  it('tracks headings in adjacent table cells when their tops are out of document order', async () => {
    const editor = await mountIndex(`
      <h2>Before the table</h2>
      <table><tbody><tr>
        <td><h2>Left top</h2><h2>Left middle</h2><h2>Left bottom</h2></td>
        <td><blockquote><h2>Right top</h2></blockquote></td>
      </tr></tbody></table>
      <h2>After the table</h2>
    `);
    const tops = [-200, -25, 200, 400, -20, 500];
    editor.view.dom.querySelectorAll('h2').forEach((heading, i) => {
      heading.getBoundingClientRect = () => ({ top: tops[i] }) as DOMRect;
    });
    editor.view.dom.closest('.editor-container')!.dispatchEvent(new Event('scroll'));
    await vi.advanceTimersByTimeAsync(32);

    await wrapper.find('.index-trigger').trigger('click');
    expect(wrapper.find('[aria-current="location"]').text()).toContain('Right top');
  });

  it('preserves the existing persistent sidebar', async () => {
    const editor = makeEditor('<h1>Overview</h1>');
    wrapper = mount(TableOfContents, { props: { editorInstance: editor } });
    await nextTick();
    expect(wrapper.find('.index-trigger').exists()).toBe(false);
    expect(wrapper.find('.toc-panel').attributes('inert')).toBeUndefined();
    await wrapper.find('.toc-close-btn').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
