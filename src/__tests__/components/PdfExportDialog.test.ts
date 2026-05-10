import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PdfExportDialog from '../../components/PdfExportDialog.vue';

const CONTENT_HTML = '<p>Test</p>';

describe('PdfExportDialog', () => {
  it('renders without crashing', () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders preview iframe with srcdoc', () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    const iframe = wrapper.find('iframe');
    expect(iframe.exists()).toBe(true);
    expect(iframe.attributes('srcdoc')).toContain('Test');
  });

  it('emits close on Zamknij click', async () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    const btn = wrapper.findAll('button').find(b => b.text() === 'Zamknij');
    await btn!.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('Drukuj button exists and has data-testid', () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    expect(wrapper.find('[data-testid="pdf-confirm"]').exists()).toBe(true);
  });

  it('srcdoc updates when fontSize changes', async () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    const iframe = wrapper.find('iframe');
    const before = iframe.attributes('srcdoc');
    await wrapper.find('[data-testid="pdf-font-size"]').setValue('12pt');
    await wrapper.vm.$nextTick();
    const after = iframe.attributes('srcdoc');
    expect(after).not.toBe(before);
    expect(after).toContain('12pt');
  });
});
