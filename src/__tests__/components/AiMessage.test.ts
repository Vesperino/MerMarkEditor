import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AiMessage from '../../components/ai/AiMessage.vue';

describe('AiMessage', () => {
  it('renders a visible tool call preview and expands full args', async () => {
    const wrapper = mount(AiMessage, {
      props: {
        hasFence: false,
        message: {
          role: 'tool',
          tool: 'Read',
          text: JSON.stringify({ file_path: 'E:/doc.md', limit: 120 }),
          done: true,
        },
      },
    });

    expect(wrapper.find('.ai-msg__tool-label').text()).toBe('Read');
    expect(wrapper.find('.ai-msg__tool-args').text()).toContain('file_path: E:/doc.md');
    expect(wrapper.find('.ai-msg__tool-args').text()).toContain('limit: 120');

    await wrapper.find('.ai-msg__tool-row').trigger('click');

    expect(wrapper.find('.ai-msg__tool-args').text()).toContain('file_path: E:/doc.md');
    expect(wrapper.find('.ai-msg__tool-details-label').text()).toBe('Full arguments');
    expect(wrapper.find('.ai-msg__tool-args-full').text()).toContain('"file_path": "E:/doc.md"');
    expect(wrapper.find('.ai-msg__tool-args-full').text()).toContain('"limit": 120');
  });

  it('shows when an expanded tool call has no captured args', async () => {
    const wrapper = mount(AiMessage, {
      props: {
        hasFence: false,
        message: {
          role: 'tool',
          tool: 'Shell',
          text: '',
          done: true,
        },
      },
    });

    expect(wrapper.find('.ai-msg__tool-args').text()).toBe('No arguments');

    await wrapper.find('.ai-msg__tool-row').trigger('click');

    expect(wrapper.find('.ai-msg__tool-args-full').text()).toBe('No arguments captured for this tool call.');
  });
});
