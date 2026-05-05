import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';

vi.mock('../../services/aiCommands', () => ({
  aiCommands: {
    imageSave: vi.fn(async (_b: Uint8Array, ext: string) => `/tmp/img.${ext}`),
  },
}));

import { useAiPendingImages, MAX_IMAGE_BYTES } from '../../composables/useAiPendingImages';
import { aiCommands } from '../../services/aiCommands';

const revoke = vi.fn();
const create = vi.fn(() => 'blob:mock');
vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke } as unknown as typeof URL);
vi.stubGlobal('crypto', { randomUUID: (() => { let n = 0; return () => `id-${++n}`; })() });
const alertSpy = vi.fn();
vi.stubGlobal('alert', alertSpy);
// jsdom defines window.alert as no-op; override
Object.defineProperty(window, 'alert', { value: alertSpy, writable: true });

function setup() {
  const Cmp = defineComponent({
    setup(_, { expose }) {
      const api = useAiPendingImages();
      expose({ api });
      return () => h('div');
    },
  });
  const w = mount(Cmp);
  return {
    wrapper: w,
    api: (w.vm as unknown as { api: ReturnType<typeof useAiPendingImages> }).api,
  };
}

function makeBlob(size: number, type = 'image/png'): Blob {
  const blob = new Blob([new Uint8Array(size)], { type });
  if (typeof (blob as unknown as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer !== 'function') {
    (blob as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer =
      async () => new ArrayBuffer(size);
  }
  return blob;
}

describe('useAiPendingImages', () => {
  beforeEach(() => {
    revoke.mockClear();
    create.mockClear();
    alertSpy.mockClear();
    (aiCommands.imageSave as ReturnType<typeof vi.fn>).mockClear();
  });

  it('addPendingImage stores blob with derived ext', () => {
    const { api } = setup();
    api.addPendingImage(makeBlob(10, 'image/jpeg'));
    expect(api.pendingImages.value).toHaveLength(1);
    expect(api.pendingImages.value[0].ext).toBe('jpg');
    expect(api.pendingImages.value[0].mime).toBe('image/jpeg');
    expect(api.pendingImages.value[0].name).toMatch(/pasted-1\.jpg/);
  });

  it('addPendingImage rejects oversized blob', () => {
    const { api } = setup();
    api.addPendingImage(makeBlob(MAX_IMAGE_BYTES + 1));
    expect(api.pendingImages.value).toHaveLength(0);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('removePendingImage revokes URL and removes entry', () => {
    const { api } = setup();
    api.addPendingImage(makeBlob(10));
    const id = api.pendingImages.value[0].id;
    api.removePendingImage(id);
    expect(api.pendingImages.value).toHaveLength(0);
    expect(revoke).toHaveBeenCalledWith('blob:mock');
  });

  it('clearPendingImages revokes all and empties', () => {
    const { api } = setup();
    api.addPendingImage(makeBlob(10));
    api.addPendingImage(makeBlob(10));
    api.clearPendingImages();
    expect(api.pendingImages.value).toHaveLength(0);
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('onComposerPaste adds image items only', () => {
    const { api } = setup();
    const file = makeBlob(10);
    const evt = {
      preventDefault: vi.fn(),
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'file', type: 'image/png', getAsFile: () => file },
        ],
      },
    } as unknown as ClipboardEvent;
    api.onComposerPaste(evt);
    expect(api.pendingImages.value).toHaveLength(1);
  });

  it('persistPendingImagesForSend returns saved paths', async () => {
    const { api } = setup();
    api.addPendingImage(makeBlob(5, 'image/png'));
    api.addPendingImage(makeBlob(5, 'image/jpeg'));
    const out = await api.persistPendingImagesForSend();
    expect(out).toEqual(['/tmp/img.png', '/tmp/img.jpg']);
    expect(aiCommands.imageSave).toHaveBeenCalledTimes(2);
  });

  it('persistPendingImagesForSend returns empty when no images', async () => {
    const { api } = setup();
    const out = await api.persistPendingImagesForSend();
    expect(out).toEqual([]);
    expect(aiCommands.imageSave).not.toHaveBeenCalled();
  });

  it('unmount revokes pending objectURLs', () => {
    const { wrapper, api } = setup();
    api.addPendingImage(makeBlob(10));
    wrapper.unmount();
    expect(revoke).toHaveBeenCalledWith('blob:mock');
  });
});
