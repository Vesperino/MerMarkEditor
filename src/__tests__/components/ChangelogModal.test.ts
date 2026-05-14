import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

vi.mock('../../services/releaseNotes', () => ({
  getAll: vi.fn(() => [
    { version: '0.2.13', tag: 'v0.2.13', title: 'B', markdown: '# Release v0.2.13\n\nNewer.' },
    { version: '0.2.12', tag: 'v0.2.12', title: 'A', markdown: '# Release v0.2.12\n\nOlder.' },
  ]),
}));

import ChangelogModal from '../../components/ChangelogModal.vue';

describe('ChangelogModal', () => {
  it('selects the newest entry by default', async () => {
    const wrapper = mount(ChangelogModal);
    await nextTick();
    expect(wrapper.html()).toContain('Newer.');
    expect(wrapper.html()).not.toContain('Older.');
  });

  it('honours initialVersion when it exists in the list', async () => {
    const wrapper = mount(ChangelogModal, { props: { initialVersion: '0.2.12' } });
    await nextTick();
    expect(wrapper.html()).toContain('Older.');
  });

  it('switches the detail pane when a list item is clicked', async () => {
    const wrapper = mount(ChangelogModal);
    await nextTick();
    const items = wrapper.findAll('.changelog-list-item');
    await items[1].trigger('click');
    expect(wrapper.html()).toContain('Older.');
  });
});
