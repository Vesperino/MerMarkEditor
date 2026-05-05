import { ref, onUnmounted } from 'vue';
import { aiCommands } from '../services/aiCommands';

export interface PendingImage {
  id: string;
  blob: Blob;
  blobUrl: string;
  name: string;
  mime: string;
  ext: string;
}

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] as const;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function useAiPendingImages() {
  const pendingImages = ref<PendingImage[]>([]);
  const previewedImage = ref<PendingImage | null>(null);

  function addPendingImage(file: Blob, name?: string) {
    if (file.size > MAX_IMAGE_BYTES) {
      window.alert(`Image too large (${Math.round(file.size / 1024 / 1024)} MB). Max ${MAX_IMAGE_BYTES / 1024 / 1024} MB.`);
      return;
    }
    const mime = file.type || 'image/png';
    const rawExt = mime.split('/')[1]?.toLowerCase() ?? 'png';
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const blobUrl = URL.createObjectURL(file);
    pendingImages.value.push({
      id: crypto.randomUUID(),
      blob: file,
      blobUrl,
      name: name ?? `pasted-${pendingImages.value.length + 1}.${ext}`,
      mime,
      ext,
    });
  }

  function removePendingImage(id: string) {
    const idx = pendingImages.value.findIndex(p => p.id === id);
    if (idx < 0) return;
    URL.revokeObjectURL(pendingImages.value[idx].blobUrl);
    pendingImages.value.splice(idx, 1);
  }

  function clearPendingImages() {
    for (const p of pendingImages.value) URL.revokeObjectURL(p.blobUrl);
    pendingImages.value = [];
  }

  /** Pop pending images as chat-attachment descriptors. Empties the strip
   *  WITHOUT revoking — caller (chat history) now owns the blob URLs. */
  function detachForChat(): Array<{ name: string; blobUrl: string }> {
    const out = pendingImages.value.map(p => ({ name: p.name, blobUrl: p.blobUrl }));
    pendingImages.value = [];
    return out;
  }

  function onComposerPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          addPendingImage(file);
        }
      }
    }
  }

  async function pickImageFile() {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: true,
      filters: [{ name: 'Images', extensions: [...IMAGE_EXTS] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    const { readFile } = await import('@tauri-apps/plugin-fs');
    for (const p of paths) {
      try {
        const bytes = await readFile(p);
        const ext = (p.split('.').pop() || 'png').toLowerCase();
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
        const blob = new Blob([bytes], { type: mime });
        const name = p.split(/[/\\]/).pop() || 'image';
        addPendingImage(blob, name);
      } catch (e) {
        console.error('[useAiPendingImages] pickImageFile read failed:', e);
      }
    }
  }

  async function persistPendingImagesForSend(): Promise<string[]> {
    if (pendingImages.value.length === 0) return [];
    const out: string[] = [];
    for (const img of pendingImages.value) {
      const buf = await img.blob.arrayBuffer();
      const path = await aiCommands.imageSave(new Uint8Array(buf), img.ext);
      out.push(path);
    }
    return out;
  }

  onUnmounted(() => {
    clearPendingImages();
  });

  return {
    pendingImages,
    previewedImage,
    addPendingImage,
    removePendingImage,
    clearPendingImages,
    detachForChat,
    onComposerPaste,
    pickImageFile,
    persistPendingImagesForSend,
  };
}
