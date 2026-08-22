import { describe, expect, it, vi } from 'vitest';
import { nextAvailableImportPath, workspaceImportDirectoryAt } from '../../utils/workspace-import';

describe('workspace file import', () => {
  it('targets a folder row, a file parent, or the workspace root', () => {
    document.body.innerHTML = `
      <aside id="sidebar">
        <section data-workspace-root="C:\\notes">
          <header id="root">notes</header>
          <div id="folder" data-tree-path="C:\\notes\\drafts" data-tree-kind="folder"><span id="folder-label">drafts</span></div>
          <div id="file" data-tree-path="C:\\notes\\drafts\\old.md" data-tree-kind="file">old.md</div>
        </section>
      </aside>`;
    const sidebar = document.querySelector<HTMLElement>('#sidebar');
    const hit = (selector: string) => () => document.querySelector(selector);

    expect(workspaceImportDirectoryAt(0, 0, sidebar, hit('#folder-label'))).toBe('C:\\notes\\drafts');
    expect(workspaceImportDirectoryAt(0, 0, sidebar, hit('#file'))).toBe('C:\\notes\\drafts');
    expect(workspaceImportDirectoryAt(0, 0, sidebar, hit('#root'))).toBe('C:\\notes');
  });

  it('keeps the original when dropped onto its own directory', async () => {
    const pathExists = vi.fn(async () => true);
    await expect(nextAvailableImportPath('C:\\notes', 'C:\\notes\\a.md', pathExists)).resolves.toBe('C:\\notes\\a.md');
    expect(pathExists).not.toHaveBeenCalled();
  });

  it('uses a non-destructive numbered name on conflicts', async () => {
    const occupied = new Set(['C:\\notes\\a.md', 'C:\\notes\\a (1).md']);
    await expect(nextAvailableImportPath('C:\\notes', 'D:\\outside\\a.md', async path => occupied.has(path)))
      .resolves.toBe('C:\\notes\\a (2).md');
  });
});
