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

  it('renders preview iframe', () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    const iframe = wrapper.find('iframe');
    expect(iframe.exists()).toBe(true);
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

  it('saves fontSize change to localStorage on print', async () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    await wrapper.find('[data-testid="pdf-font-size"]').setValue('12pt');
    await wrapper.find('[data-testid="pdf-confirm"]').trigger('click');
    const raw = localStorage.getItem('mermark.pdfSettings');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).fontSize).toBe('12pt');
  });

  it('switches to Typography tab and shows font family selector', async () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    const tabBtns = wrapper.findAll('.pdf-tab');
    // Typography is the 2nd tab regardless of locale
    await tabBtns[1].trigger('click');
    expect(wrapper.find('[data-testid="pdf-font-family"]').exists()).toBe(true);
  });

  it('switches to Watermark tab and toggles watermark', async () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    const tabBtns = wrapper.findAll('.pdf-tab');
    // Watermark is the 5th tab (Layout/Typography/Header/TOC/Watermark)
    await tabBtns[4].trigger('click');
    const cb = wrapper.find('[data-testid="pdf-watermark-enabled"]');
    expect(cb.exists()).toBe(true);
    await cb.setValue(true);
    await wrapper.find('[data-testid="pdf-confirm"]').trigger('click');
    const raw = localStorage.getItem('mermark.pdfSettings');
    expect(JSON.parse(raw!).watermark.enabled).toBe(true);
  });

  it('preset select includes Current Editor and 3 builtin presets and "no preset" option', () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: CONTENT_HTML } });
    const opts = wrapper.find('[data-testid="pdf-preset-select"]').findAll('option');
    // 1 "no preset" + 3 builtins = at least 4 options
    expect(opts.length).toBeGreaterThanOrEqual(4);
    const values = opts.map(o => o.attributes('value'));
    expect(values).toContain('builtin-current-editor');
    expect(values).toContain('builtin-report');
    expect(values).toContain('builtin-notes');
    expect(values).toContain('builtin-draft');
  });
});

describe('Current Editor PDF preset', () => {
  beforeEach(() => localStorage.clear());
  it('inherits typography, retains it on margin edits, and snapshots it on typography edits', async () => {
    const wrapper = mount(PdfExportDialog, { props: { contentHtml: '<h1>Title</h1>' } });
    const preset = wrapper.find('[data-testid="pdf-preset-select"]');
    expect((preset.element as HTMLSelectElement).value).toBe('builtin-current-editor');
    await wrapper.find('[data-testid="pdf-margins"]').setValue('wide');
    expect((preset.element as HTMLSelectElement).value).toBe('builtin-current-editor');
    await wrapper.find('[data-testid="pdf-font-size"]').setValue('11pt');
    expect((preset.element as HTMLSelectElement).value).toBe('');
    await wrapper.find('[data-testid="pdf-confirm"]').trigger('click');
    const saved = JSON.parse(localStorage.getItem('mermark.pdfSettings')!);
    expect(saved.typographySource).toBe('custom');
    expect(saved.documentStyleSnapshot.id).toBe('github');
    await preset.setValue('builtin-current-editor');
    await wrapper.find('[data-testid="pdf-confirm"]').trigger('click');
    expect(JSON.parse(localStorage.getItem('mermark.pdfSettings')!).typographySource).toBe('current-editor');
    wrapper.unmount();
  });
});
