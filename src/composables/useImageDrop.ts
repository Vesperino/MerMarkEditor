import type { Ref } from 'vue';
import { isImageFile, escapeMarkdownAlt } from '../utils/image-file-utils';
import { importImage, type ImportedImage } from '../services/imageImport';

export interface InsertableImage {
  path: string;
  alt: string;
}

export interface ImageDropTarget {
  filePath: string | null;
  insertImages: (items: InsertableImage[]) => void;
}

function toInsertable(item: ImportedImage): InsertableImage {
  return { path: item.markdownPath, alt: item.altText };
}

export interface UseImageDropOptions {
  codeView: Ref<boolean>;
  codeEditorTextarea: () => HTMLTextAreaElement | null;
  activeFilePath: () => string | null;
  findVisualTargetAt: (x: number, y: number) => ImageDropTarget | null;
  onImagesImported?: () => void;
  onError?: (message: string) => void;
}

export interface UseImageDropReturn {
  handleDrop: (paths: string[], position: { x: number; y: number }) => Promise<void>;
}

export function useImageDrop(options: UseImageDropOptions): UseImageDropReturn {
  const handleDrop = async (paths: string[], position: { x: number; y: number }): Promise<void> => {
    const imagePaths = paths.filter(isImageFile);
    if (imagePaths.length === 0) return;

    if (options.codeView.value) {
      await insertIntoTextarea(imagePaths, options);
    } else {
      await insertIntoVisualPane(imagePaths, position, options);
    }

    options.onImagesImported?.();
  };

  return { handleDrop };
}

async function insertIntoVisualPane(
  paths: string[],
  position: { x: number; y: number },
  options: UseImageDropOptions,
): Promise<void> {
  const dpr = window.devicePixelRatio || 1;
  const target = options.findVisualTargetAt(position.x / dpr, position.y / dpr);
  if (!target) return;

  const items = await importAll(paths, target.filePath, options.onError);
  if (items.length > 0) target.insertImages(items.map(toInsertable));
}

async function insertIntoTextarea(paths: string[], options: UseImageDropOptions): Promise<void> {
  const textarea = options.codeEditorTextarea();
  if (!textarea) return;

  const filePath = options.activeFilePath();
  const items = await importAll(paths, filePath, options.onError);
  if (items.length === 0) return;

  const markdown = buildMarkdownBlock(items);
  insertAtCursor(textarea, markdown);
}

async function importAll(
  paths: string[],
  docPath: string | null,
  onError?: (msg: string) => void,
): Promise<ImportedImage[]> {
  const results: ImportedImage[] = [];
  for (const src of paths) {
    try {
      results.push(await importImage(src, docPath));
    } catch (err) {
      console.warn('[useImageDrop] Failed to import image:', src, err);
      onError?.(src);
    }
  }
  return results;
}

function buildMarkdownBlock(items: ImportedImage[]): string {
  return items
    .map((item) => `![${escapeMarkdownAlt(item.altText)}](${item.markdownPath})`)
    .join('\n\n');
}

function insertAtCursor(textarea: HTMLTextAreaElement, text: string): void {
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);

  const needsLeadingNewline = before.length > 0 && !before.endsWith('\n');
  const needsTrailingNewline = after.length > 0 && !after.startsWith('\n');

  const prefix = needsLeadingNewline ? '\n' : '';
  const suffix = needsTrailingNewline ? '\n' : '';
  const payload = `${prefix}${text}${suffix}`;

  textarea.value = `${before}${payload}${after}`;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));

  const caret = start + payload.length;
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
}
