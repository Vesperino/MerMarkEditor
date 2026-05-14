import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PdfExportDialog from '../../components/PdfExportDialog.vue';

const CONTENT_HTML = '<p>Test</p>';

describe('PdfExportDialog', () => {
  beforeEach(() => {
    localStorage.clear();
  });

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
    await wrapper.find('[data-testid="pdf-close"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('Drukuj button exists with data-testid', () => {
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

  it('switches to Typography tab and shows font family selector', async () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    const tabBtns = wrapper.findAll('.pdf-tab');
    const typoTab = tabBtns.find(b => b.text() === 'Typografia');
    await typoTab!.trigger('click');
    expect(wrapper.find('[data-testid="pdf-font-family"]').exists()).toBe(true);
  });

  it('switches to Watermark tab and toggles watermark', async () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    const tabBtns = wrapper.findAll('.pdf-tab');
    const wmTab = tabBtns.find(b => b.text() === 'Watermark');
    await wmTab!.trigger('click');
    const cb = wrapper.find('[data-testid="pdf-watermark-enabled"]');
    expect(cb.exists()).toBe(true);
    await cb.setValue(true);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('iframe').attributes('srcdoc')).toContain('pdf-watermark');
  });

  it('preset select includes builtin presets', () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    const opts = wrapper.find('[data-testid="pdf-preset-select"]').findAll('option');
    const labels = opts.map(o => o.text());
    expect(labels).toContain('Raport firmowy');
    expect(labels).toContain('Notatki');
  });
});
