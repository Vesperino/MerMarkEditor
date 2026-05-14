import { copyFile, mkdir, exists, writeFile } from '@tauri-apps/plugin-fs';
import { getDirectoryFromFilePath } from '../utils/image-resolver';
import { splitFilename, toForwardSlashes } from '../utils/image-file-utils';

const IMAGES_DIR = 'images';

export interface ImportedImage {
  /** Path to use inside markdown — relative when copied, absolute when doc unsaved. */
  markdownPath: string;
  /** Alt text suggestion derived from filename (without extension). */
  altText: string;
}

/**
 * Imports a dropped image. If the host document is saved, copies the image into
 * `<docDir>/images/` (creating the directory + resolving name collisions) and
 * returns a relative path. Otherwise returns the absolute source path.
 */
export async function importImage(srcPath: string, docPath: string | null): Promise<ImportedImage> {
  const { stem, ext } = splitFilename(srcPath);
  const altText = stem;

  if (!docPath) {
    return { markdownPath: toForwardSlashes(srcPath), altText };
  }

  const docDir = getDirectoryFromFilePath(docPath);
  if (!docDir) {
    return { markdownPath: toForwardSlashes(srcPath), altText };
  }

  const targetDir = `${docDir}/${IMAGES_DIR}`;
  await mkdir(targetDir, { recursive: true });

  const finalName = await resolveCollision(targetDir, stem, ext);
  const targetPath = `${targetDir}/${finalName}`;

  await copyFile(srcPath, targetPath);

  return {
    markdownPath: `${IMAGES_DIR}/${finalName}`,
    altText,
  };
}

/**
 * Imports raw image bytes (e.g. from clipboard paste). Writes the bytes into
 * `<docDir>/images/` with collision-safe naming and returns the markdown path.
 * Falls back to a data: URL if the document is unsaved (no anchor directory).
 */
export async function importImageBytes(
  bytes: Uint8Array,
  ext: string,
  docPath: string | null,
  stemHint: string = 'pasted-image',
): Promise<ImportedImage> {
  const stem = `${stemHint}-${Date.now()}`;

  if (!docPath) {
    const blob = new Blob([bytes], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
    const dataUrl = await blobToDataUrl(blob);
    return { markdownPath: dataUrl, altText: stem };
  }

  const docDir = getDirectoryFromFilePath(docPath);
  if (!docDir) {
    const blob = new Blob([bytes], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
    const dataUrl = await blobToDataUrl(blob);
    return { markdownPath: dataUrl, altText: stem };
  }

  const targetDir = `${docDir}/${IMAGES_DIR}`;
  await mkdir(targetDir, { recursive: true });
  const finalName = await resolveCollision(targetDir, stem, ext);
  const targetPath = `${targetDir}/${finalName}`;

  await writeFile(targetPath, bytes);

  return { markdownPath: `${IMAGES_DIR}/${finalName}`, altText: stem };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function resolveCollision(dir: string, stem: string, ext: string): Promise<string> {
  const suffix = ext ? `.${ext}` : '';
  const initial = `${stem}${suffix}`;
  if (!(await exists(`${dir}/${initial}`))) return initial;

  for (let i = 1; i < 1000; i++) {
    const candidate = `${stem} (${i})${suffix}`;
    if (!(await exists(`${dir}/${candidate}`))) return candidate;
  }

  return `${stem}-${Date.now()}${suffix}`;
}
