import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import SplitContainer from '../../components/SplitContainer.vue';
import { useSplitView } from '../../composables/useSplitView';
import { createDefaultSplitViewState } from '../../types/pane';

const { splitState, createTab, enableSplit, switchTab } = useSplitView();
let wrapper: VueWrapper | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  splitState.value = createDefaultSplitViewState();
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('editor pane index', () => {
  it('shows each pane’s outline and removes both floating indexes when disabled', async () => {
    createTab('left', null, '<h1>Left document</h1>');
    enableSplit();
    createTab('right', null, '<h1>Right document</h1>');
    wrapper = mount(SplitContainer, { props: { showIndex: true }, attachTo: document.body });
    await nextTick();

    const left = wrapper.get('[data-pane-id="left"]');
    const right = wrapper.get('[data-pane-id="right"]');
    await left.get('.index-trigger').trigger('click');
    expect(left.get('.toc-item').attributes('title')).toBe('Left document');
    await right.get('.index-trigger').trigger('click');
    expect(right.get('.toc-item').attributes('title')).toBe('Right document');
    expect(wrapper.findAll('.with-editor-index')).toHaveLength(2);

    await wrapper.setProps({ showIndex: false });
    expect(wrapper.findAll('.editor-index')).toHaveLength(0);
    expect(wrapper.findAll('.with-editor-index')).toHaveLength(0);
    expect(wrapper.findAll('.editor-container')).toHaveLength(2);
  });

  it('resets the flyout and updates the gutter when switching tabs', async () => {
    const headingless = splitState.value.panes[0].activeTabId;
    const first = createTab('left', null, '<h1>First document</h1>');
    const second = createTab('left', null, '<h1>Second document</h1>');
    switchTab('left', first);
    wrapper = mount(SplitContainer, { props: { showIndex: true }, attachTo: document.body });
    await nextTick();

    const editor = wrapper.get('.editor-container').element;
    await wrapper.get('.index-trigger').trigger('click');
    expect(wrapper.get('.toc-item').attributes('title')).toBe('First document');

    switchTab('left', second);
    await nextTick();
    expect(wrapper.get('.editor-container').element).toBe(editor);
    expect(wrapper.get('.index-trigger').attributes('aria-expanded')).toBe('false');
    await wrapper.get('.index-trigger').trigger('click');
    expect(wrapper.get('.toc-item').attributes('title')).toBe('Second document');

    switchTab('left', headingless);
    await nextTick();
    expect(wrapper.find('.with-editor-index').exists()).toBe(false);
    expect(wrapper.find('.index-trigger').isVisible()).toBe(false);
  });
});
