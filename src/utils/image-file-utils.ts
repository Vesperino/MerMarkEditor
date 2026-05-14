export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'] as const;

export type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

const EXTENSION_SET = new Set<string>(IMAGE_EXTENSIONS);

export function getExtension(path: string): string {
  const dot = path.lastIndexOf('.');
  if (dot < 0) return '';
  return path.slice(dot + 1).toLowerCase();
}

export function isImageFile(path: string): boolean {
  return EXTENSION_SET.has(getExtension(path));
}

export function getFilename(path: string): string {
  const sep = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return sep >= 0 ? path.slice(sep + 1) : path;
}

export function splitFilename(path: string): { stem: string; ext: string } {
  const name = getFilename(path);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { stem: name, ext: '' };
  return { stem: name.slice(0, dot), ext: name.slice(dot + 1) };
}

export function escapeMarkdownAlt(text: string): string {
  return text.replace(/[\[\]()\\]/g, (m) => `\\${m}`);
}

export function toForwardSlashes(path: string): string {
  return path.replace(/\\/g, '/');
}
