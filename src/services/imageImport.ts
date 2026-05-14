import { copyFile, mkdir, exists } from '@tauri-apps/plugin-fs';
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
