import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AiAttachmentModal from '../../components/ai/AiAttachmentModal.vue';

const pins = [
  { id: '1', text: 'first' },
  { id: '2', text: 'second' },
];

describe('AiAttachmentModal', () => {
  it('renders one item per pin', () => {
    const w = mount(AiAttachmentModal, { props: { pins } });
    expect(w.findAll('.ai-attach-modal__item')).toHaveLength(2);
    expect(w.text()).toContain('2 attached fragments');
  });

  it('uses singular noun for one item', () => {
    const w = mount(AiAttachmentModal, { props: { pins: [pins[0]] } });
    expect(w.text()).toContain('1 attached fragment');
  });

  it('emits close on backdrop self-click', async () => {
    const w = mount(AiAttachmentModal, { props: { pins } });
    await w.find('.ai-attach-modal').trigger('click');
    expect(w.emitted('close')).toBeTruthy();
  });

  it('emits close on × button', async () => {
    const w = mount(AiAttachmentModal, { props: { pins } });
    await w.find('.ai-attach-modal__close').trigger('click');
    expect(w.emitted('close')).toBeTruthy();
  });
});
