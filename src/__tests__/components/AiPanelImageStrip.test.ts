import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import AiPanelImageStrip from '../../components/ai/AiPanelImageStrip.vue';
import type { PendingImage } from '../../composables/useAiPendingImages';

const images: PendingImage[] = [
  { id: '1', blob: new Blob(), blobUrl: 'blob:1', name: 'a.png', mime: 'image/png', ext: 'png' },
  { id: '2', blob: new Blob(), blobUrl: 'blob:2', name: 'b.jpg', mime: 'image/jpeg', ext: 'jpg' },
];

describe('AiPanelImageStrip', () => {
  it('renders a thumbnail per image', () => {
    const w = mount(AiPanelImageStrip, { props: { images } });
    expect(w.findAll('.ai-panel__image-thumb')).toHaveLength(2);
    expect(w.text()).toContain('2 images attached');
  });

  it('uses singular wording for one image', () => {
    const w = mount(AiPanelImageStrip, { props: { images: [images[0]] } });
    expect(w.text()).toContain('1 image attached');
  });

  it('renders nothing when empty', () => {
    const w = mount(AiPanelImageStrip, { props: { images: [] } });
    expect(w.find('.ai-panel__images').exists()).toBe(false);
  });

  it('emits preview with image when thumbnail button clicked', async () => {
    const w = mount(AiPanelImageStrip, { props: { images } });
    await w.findAll('.ai-panel__image-thumb-btn')[0].trigger('click');
    expect(w.emitted('preview')?.[0]).toEqual([images[0]]);
  });

  it('emits remove with id when × clicked', async () => {
    const w = mount(AiPanelImageStrip, { props: { images } });
    await w.findAll('.ai-panel__image-rm')[1].trigger('click');
    expect(w.emitted('remove')?.[0]).toEqual(['2']);
  });

  it('emits clear when Clear button clicked', async () => {
    const w = mount(AiPanelImageStrip, { props: { images } });
    await w.find('.ai-panel__pinned-action--clear').trigger('click');
    expect(w.emitted('clear')).toBeTruthy();
  });
});
