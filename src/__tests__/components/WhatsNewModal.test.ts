import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

vi.mock('@tauri-apps/api/app', () => ({
  getVersion: vi.fn().mockResolvedValue('0.2.12'),
}));

vi.mock('../../services/releaseNotes', () => ({
  getCurrent: vi.fn((version: string) =>
    version === '0.2.12'
      ? { version, tag: 'v0.2.12', title: 'PDF fixes', markdown: '# Release v0.2.12\n\nHello.' }
      : null,
  ),
}));

import WhatsNewModal from '../../components/WhatsNewModal.vue';

afterEach(() => vi.clearAllMocks());

describe('WhatsNewModal', () => {
  it('renders the markdown for the installed version', async () => {
    const wrapper = mount(WhatsNewModal);
    await nextTick();
    await nextTick();
    expect(wrapper.html()).toContain('Hello.');
  });

  it('emits openChangelog when the footer button is clicked', async () => {
    const wrapper = mount(WhatsNewModal);
    await nextTick();
    await nextTick();
    await wrapper.find('.whats-new-changelog-btn').trigger('click');
    expect(wrapper.emitted('openChangelog')).toHaveLength(1);
  });

  it('shows the empty state when no entry matches the installed version', async () => {
    const { getCurrent } = await import('../../services/releaseNotes');
    (getCurrent as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    const wrapper = mount(WhatsNewModal);
    await nextTick();
    await nextTick();
    expect(wrapper.html()).toContain('No release notes for this build yet.');
  });
});
