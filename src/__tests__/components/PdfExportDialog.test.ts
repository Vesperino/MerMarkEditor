import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PdfExportDialog from '../../components/PdfExportDialog.vue';
import type { PdfSettings } from '../../composables/usePdfExport';

describe('PdfExportDialog', () => {
  it('renders without crashing', () => {
    const wrapper = mount(PdfExportDialog);
    expect(wrapper.exists()).toBe(true);
  });

  it('emits confirm with default settings on export click', async () => {
    const wrapper = mount(PdfExportDialog);
    await wrapper.find('[data-testid="pdf-confirm"]').trigger('click');
    const emitted = wrapper.emitted('confirm') as [PdfSettings][];
    expect(emitted).toBeTruthy();
    expect(emitted[0][0].fontSize).toBe('10pt');
    expect(emitted[0][0].margins).toBe('normal');
    expect(emitted[0][0].pageSize).toBe('A4');
  });

  it('emits cancel on cancel click', async () => {
    const wrapper = mount(PdfExportDialog);
    await wrapper.find('[data-testid="pdf-cancel"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('emits confirm with updated fontSize when changed', async () => {
    const wrapper = mount(PdfExportDialog);
    const select = wrapper.find('[data-testid="pdf-font-size"]');
    await select.setValue('12pt');
    await wrapper.find('[data-testid="pdf-confirm"]').trigger('click');
    const emitted = wrapper.emitted('confirm') as [PdfSettings][];
    expect(emitted[0][0].fontSize).toBe('12pt');
  });

  it('emits confirm with updated margins when changed', async () => {
    const wrapper = mount(PdfExportDialog);
    await wrapper.find('[data-testid="pdf-margins"]').setValue('wide');
    await wrapper.find('[data-testid="pdf-confirm"]').trigger('click');
    const emitted = wrapper.emitted('confirm') as [PdfSettings][];
    expect(emitted[0][0].margins).toBe('wide');
  });
});
