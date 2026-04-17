import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UpdateDialog from '../../components/UpdateDialog.vue';

describe('UpdateDialog', () => {
  it('mounts without template compile errors', () => {
    const wrapper = mount(UpdateDialog, {
      props: { version: '0.1.72', notes: '' },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders the version string', () => {
    const wrapper = mount(UpdateDialog, {
      props: { version: '0.1.72', notes: '' },
    });
    expect(wrapper.text()).toContain('0.1.72');
  });

  it('renders notes when provided', () => {
    const wrapper = mount(UpdateDialog, {
      props: { version: '0.1.72', notes: '## New features\n\n- Footnote support' },
    });
    expect(wrapper.find('.update-notes').exists()).toBe(true);
    expect(wrapper.html()).toContain('New features');
  });

  it('hides notes section when notes are empty', () => {
    const wrapper = mount(UpdateDialog, {
      props: { version: '0.1.72', notes: '' },
    });
    expect(wrapper.find('.update-notes-container').exists()).toBe(false);
  });

  it('toggles notes expanded state on button click', async () => {
    const wrapper = mount(UpdateDialog, {
      props: { version: '0.1.72', notes: '- change one' },
    });
    const toggle = wrapper.find('.update-notes-toggle');
    expect(toggle.exists()).toBe(true);
    expect(toggle.classes()).toContain('expanded');

    await toggle.trigger('click');
    expect(toggle.classes()).not.toContain('expanded');

    await toggle.trigger('click');
    expect(toggle.classes()).toContain('expanded');
  });

  it('emits close on Later button', async () => {
    const wrapper = mount(UpdateDialog, {
      props: { version: '0.1.72', notes: '' },
    });
    await wrapper.find('.btn-cancel').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('emits update on Update Now button', async () => {
    const wrapper = mount(UpdateDialog, {
      props: { version: '0.1.72', notes: '' },
    });
    await wrapper.find('.btn-confirm').trigger('click');
    expect(wrapper.emitted('update')).toBeTruthy();
  });

  it('disables buttons while updating', () => {
    const wrapper = mount(UpdateDialog, {
      props: { version: '0.1.72', notes: '', isUpdating: true },
    });
    expect(wrapper.find<HTMLButtonElement>('.btn-cancel').element.disabled).toBe(true);
    expect(wrapper.find<HTMLButtonElement>('.btn-confirm').element.disabled).toBe(true);
  });

  it('shows progress bar during update', () => {
    const wrapper = mount(UpdateDialog, {
      props: { version: '0.1.72', notes: '', isUpdating: true, progress: 42 },
    });
    const fill = wrapper.find<HTMLDivElement>('.progress-fill');
    expect(fill.exists()).toBe(true);
    expect(fill.element.style.width).toBe('42%');
  });

  it('shows error message when provided', () => {
    const wrapper = mount(UpdateDialog, {
      props: { version: '0.1.72', notes: '', error: 'Network failed' },
    });
    expect(wrapper.find('.update-error').text()).toBe('Network failed');
  });
});
