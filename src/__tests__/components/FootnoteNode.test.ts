import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import FootnoteNode from '../../components/FootnoteNode.vue';

// Stub the NodeViewWrapper from @tiptap/vue-3 so we can mount the component
// without a full ProseMirror/Tiptap environment.
vi.mock('@tiptap/vue-3', () => ({
  NodeViewWrapper: {
    name: 'NodeViewWrapper',
    template: '<section><slot /></section>',
  },
}));

function makeProps(definitions: Array<{ label: string; content: string }>) {
  return {
    node: { attrs: { definitions: JSON.stringify(definitions) } },
    updateAttributes: vi.fn(),
    selected: false,
  };
}

describe('FootnoteNode', () => {
  it('mounts without template compile errors', () => {
    const wrapper = mount(FootnoteNode, { props: makeProps([]) });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders each definition with index and content', () => {
    const wrapper = mount(FootnoteNode, {
      props: makeProps([
        { label: '1', content: 'First note' },
        { label: 'note', content: 'Named note' },
      ]),
    });
    const items = wrapper.findAll('.footnote-item');
    expect(items).toHaveLength(2);
    expect(items[0].text()).toContain('1.');
    expect(items[0].text()).toContain('First note');
    expect(items[1].text()).toContain('2.');
    expect(items[1].text()).toContain('Named note');
  });

  it('exposes the definition label on data-footnote-label', () => {
    const wrapper = mount(FootnoteNode, {
      props: makeProps([{ label: 'foo', content: 'bar' }]),
    });
    expect(wrapper.find('[data-footnote-label="foo"]').exists()).toBe(true);
  });

  it('renders backlink button for each definition', () => {
    const wrapper = mount(FootnoteNode, {
      props: makeProps([
        { label: '1', content: 'a' },
        { label: '2', content: 'b' },
      ]),
    });
    expect(wrapper.findAll('.footnote-backlink')).toHaveLength(2);
  });

  it('backlink click dispatches mermark-footnote-backlink event with label', async () => {
    const wrapper = mount(FootnoteNode, {
      props: makeProps([{ label: 'my-label', content: 'x' }]),
      attachTo: document.body,
    });

    let capturedLabel: string | null = null;
    document.body.addEventListener(
      'mermark-footnote-backlink',
      (e) => { capturedLabel = (e as CustomEvent<{ label: string }>).detail.label; },
      { once: true },
    );

    await wrapper.find('.footnote-backlink').trigger('click');
    expect(capturedLabel).toBe('my-label');
    wrapper.unmount();
  });

  it('handles malformed definitions JSON gracefully', () => {
    const wrapper = mount(FootnoteNode, {
      props: {
        node: { attrs: { definitions: 'not-json' } },
        updateAttributes: vi.fn(),
        selected: false,
      },
    });
    expect(wrapper.findAll('.footnote-item')).toHaveLength(0);
  });

  it('enters edit mode when clicking definition content', async () => {
    const wrapper = mount(FootnoteNode, {
      props: makeProps([{ label: '1', content: 'original' }]),
    });
    await wrapper.find('.footnote-def-content').trigger('click');
    expect(wrapper.find('.footnote-edit-input').exists()).toBe(true);
  });

  it('calls updateAttributes with new content on blur save', async () => {
    const updateAttributes = vi.fn();
    const wrapper = mount(FootnoteNode, {
      props: {
        node: { attrs: { definitions: JSON.stringify([{ label: '1', content: 'old' }]) } },
        updateAttributes,
        selected: false,
      },
    });

    await wrapper.find('.footnote-def-content').trigger('click');
    const textarea = wrapper.find<HTMLTextAreaElement>('.footnote-edit-input');
    await textarea.setValue('updated');
    await textarea.trigger('blur');

    expect(updateAttributes).toHaveBeenCalledWith({
      definitions: JSON.stringify([{ label: '1', content: 'updated' }]),
    });
  });

  it('cancels edit on Escape without calling updateAttributes', async () => {
    const updateAttributes = vi.fn();
    const wrapper = mount(FootnoteNode, {
      props: {
        node: { attrs: { definitions: JSON.stringify([{ label: '1', content: 'old' }]) } },
        updateAttributes,
        selected: false,
      },
    });

    await wrapper.find('.footnote-def-content').trigger('click');
    const textarea = wrapper.find<HTMLTextAreaElement>('.footnote-edit-input');
    await textarea.setValue('updated');
    await textarea.trigger('keydown', { key: 'Escape' });

    expect(updateAttributes).not.toHaveBeenCalled();
    expect(wrapper.find('.footnote-edit-input').exists()).toBe(false);
  });
});
