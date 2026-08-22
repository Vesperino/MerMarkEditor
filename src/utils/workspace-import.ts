import { basenameOf, dirnameOf, joinPath } from './path-utils';

const comparablePath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

export function workspaceImportDirectoryAt(
  x: number,
  y: number,
  sidebar: HTMLElement | null,
  elementFromPoint: (x: number, y: number) => Element | null = document.elementFromPoint.bind(document),
): string | null {
  if (!sidebar) return null;
  const hit = elementFromPoint(x, y);
  if (!hit || !sidebar.contains(hit)) return null;

  const row = hit.closest<HTMLElement>('[data-tree-path][data-tree-kind]');
  if (row?.dataset.treePath) {
    return row.dataset.treeKind === 'folder' ? row.dataset.treePath : dirnameOf(row.dataset.treePath);
  }

  return hit.closest<HTMLElement>('[data-workspace-root]')?.dataset.workspaceRoot ?? null;
}

export async function nextAvailableImportPath(
  directory: string,
  sourcePath: string,
  pathExists: (path: string) => Promise<boolean>,
): Promise<string> {
  const name = basenameOf(sourcePath);
  const direct = joinPath(directory, name);
  if (comparablePath(direct) === comparablePath(sourcePath)) return sourcePath;
  if (!(await pathExists(direct))) return direct;

  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let suffix = 1; suffix < 10_000; suffix++) {
    const candidate = joinPath(directory, `${stem} (${suffix})${extension}`);
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error(`Could not find a free filename for ${name}`);
}
