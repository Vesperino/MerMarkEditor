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
function mimeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
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
  return mimeMap[ext] || 'image/png';
}

async function fileToBlobUrl(absolutePath: string): Promise<string> {
  const bytes = await readFile(absolutePath);
  const blob = new Blob([bytes], { type: mimeForPath(absolutePath) });
  return URL.createObjectURL(blob);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const dataUriCache = new Map<string, string>();
const DATA_URI_CACHE_MAX = 40;

async function fileToDataUri(absolutePath: string): Promise<string> {
  if (dataUriCache.has(absolutePath)) return dataUriCache.get(absolutePath)!;
  const bytes = await readFile(absolutePath);
  const uri = `data:${mimeForPath(absolutePath)};base64,${bytesToBase64(bytes)}`;
  dataUriCache.set(absolutePath, uri);
  // Bound memory: base64 of large images is heavy; evict oldest beyond the cap.
  if (dataUriCache.size > DATA_URI_CACHE_MAX) {
    dataUriCache.delete(dataUriCache.keys().next().value as string);
  }
  return uri;
}

/**
 * Inlines local image references in a markdown string as base64 data URIs.
 * Used for Marp export/preview where the rendered HTML lives in a sandboxed
 * iframe (srcdoc) with no base URL, so relative/local paths can't be fetched.
 * Remote (http/https), data: and blob: sources are left untouched.
 */
export async function inlineMarkdownImages(markdown: string, baseDir?: string): Promise<string> {
  const imageRe = /!\[([^\]]*)\]\(\s*([^)\s]+)((?:\s+"[^"]*")?)\s*\)/g;
  const matches = [...markdown.matchAll(imageRe)];
  const replacements = new Map<string, string>();

  await Promise.all(
    matches.map(async (m) => {
      const src = m[2];
      if (replacements.has(src)) return;
      if (/^(data:|blob:|https?:)/i.test(src)) return;

      const isAbsolute = /^[a-zA-Z]:/.test(src) || src.startsWith('/');
      if (!isAbsolute && !baseDir) return;
      const absolutePath = isAbsolute ? src : resolveToAbsolutePath(src, baseDir!);

      try {
        replacements.set(src, await fileToDataUri(absolutePath));
      } catch (e) {
        console.warn(`[ImageResolver] Failed to inline image: ${absolutePath}`, e);
      }
    })
  );

  if (replacements.size === 0) return markdown;
  return markdown.replace(imageRe, (full, alt, src, title) => {
    const uri = replacements.get(src);
    return uri ? `![${alt}](${uri}${title})` : full;
  });
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
