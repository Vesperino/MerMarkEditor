import { readFile } from '@tauri-apps/plugin-fs';

/**
 * Resolves a relative image path to an absolute file path.
 */
function resolveToAbsolutePath(src: string, baseDir: string): string {
  if (/^[a-zA-Z]:/.test(src) || src.startsWith('/')) {
    return src; // Already absolute
  }

  let absolutePath = `${baseDir}/${src}`.replace(/\\/g, '/');
  const parts = absolutePath.split('/');
  const normalized: string[] = [];
  for (const part of parts) {
    if (part === '..') {
      normalized.pop();
    } else if (part !== '.' && part !== '') {
      normalized.push(part);
    }
  }
  absolutePath = normalized.join('/');
  if (/^[a-zA-Z]\//.test(absolutePath)) {
    absolutePath = absolutePath.replace(/^([a-zA-Z])\//, '$1:/');
  }
  return absolutePath;
}

/**
 * Reads a local file and returns a blob URL.
 */
async function fileToBlobUrl(absolutePath: string): Promise<string> {
  const bytes = await readFile(absolutePath);
  const ext = absolutePath.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
  };
  const mime = mimeMap[ext] || 'image/png';
  const blob = new Blob([bytes], { type: mime });
  return URL.createObjectURL(blob);
}

// Cache to avoid re-reading same files
const blobUrlCache = new Map<string, string>();

/**
 * Resolves local image paths in the editor DOM to displayable blob URLs.
 * Only modifies the DOM display — does NOT change Tiptap's internal model.
 *
 * @param container - The ProseMirror editor DOM element
 * @param baseDir - The directory of the currently opened file (optional for absolute paths)
 */
export async function resolveEditorImages(container: Element, baseDir?: string): Promise<void> {
  const images = container.querySelectorAll<HTMLImageElement>('img.editor-image');
  const promises = Array.from(images).map(async (img) => {
    const src = img.getAttribute('src') || '';

    // Skip images that are already resolved (blob/data/http URLs)
    if (/^(blob:|data:|https?:)/i.test(src)) return;
    // Skip empty src
    if (!src) return;

    const isAbsolute = /^[a-zA-Z]:/.test(src) || src.startsWith('/');
    // Skip relative paths when we don't have a baseDir
    if (!isAbsolute && !baseDir) return;

    const absolutePath = isAbsolute ? src : resolveToAbsolutePath(src, baseDir!);

    // Preserve original path before replacing src with blob URL
    if (!img.getAttribute('data-original-src')) {
      img.setAttribute('data-original-src', src);
    }

    // Check cache
    if (blobUrlCache.has(absolutePath)) {
      img.src = blobUrlCache.get(absolutePath)!;
      return;
    }

    try {
      const blobUrl = await fileToBlobUrl(absolutePath);
      blobUrlCache.set(absolutePath, blobUrl);
      img.src = blobUrl;
    } catch (e) {
      console.warn(`[ImageResolver] Failed to load image: ${absolutePath}`, e);
    }
  });
  await Promise.all(promises);
}

/**
 * Extracts the directory from a file path.
 */
export function getDirectoryFromFilePath(filePath: string): string {
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : '';
}
