import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/plugin-fs', () => ({ readFile: vi.fn() }));

import { resolveImageLink } from '../../utils/image-resolver';

const local = (src: string) => ({ src, localFile: true });

describe('resolveImageLink', () => {
  it('resolves a relative path against a Windows document path', () => {
    expect(resolveImageLink('img\\a.png', 'C:\\docs\\note.md')).toEqual(local('C:/docs/img/a.png'));
  });

  it('collapses . and .. segments', () => {
    expect(resolveImageLink('../assets/./b.jpg', 'C:\\docs\\sub\\note.md')).toEqual(local('C:/docs/assets/b.jpg'));
  });

  it('keeps the server and share of a UNC document path', () => {
    expect(resolveImageLink('pics/c.png', '\\\\server\\share\\notes\\n.md')).toEqual(local('//server/share/notes/pics/c.png'));
    expect(resolveImageLink('../../c.png', '\\\\server\\share\\notes\\n.md')).toEqual(local('//server/share/c.png'));
  });

  it('resolves against a POSIX document path', () => {
    expect(resolveImageLink('a.png', '/home/u/doc.md')).toEqual(local('/home/u/a.png'));
    expect(resolveImageLink('/abs/a.png', '/home/u/doc.md')).toEqual(local('/abs/a.png'));
  });

  it('decodes percent-encoded names', () => {
    expect(resolveImageLink('my%20pic.png', '/home/u/doc.md')).toEqual(local('/home/u/my pic.png'));
  });

  it('strips a ?query#hash suffix', () => {
    expect(resolveImageLink('a.png?raw=1#frag', '/home/u/doc.md')).toEqual(local('/home/u/a.png'));
  });

  it('returns a remote image for http(s) and protocol-relative URLs', () => {
    expect(resolveImageLink('https://example.com/x/y.png?s=1')).toEqual({ src: 'https://example.com/x/y.png?s=1', localFile: false });
    expect(resolveImageLink('//cdn.example.com/z.gif')).toEqual({ src: 'https://cdn.example.com/z.gif', localFile: false });
  });

  it('returns null for links that are not images', () => {
    expect(resolveImageLink('notes.md', '/home/u/doc.md')).toBeNull();
    expect(resolveImageLink('https://example.com/page')).toBeNull();
  });

  it('returns null for non-file schemes', () => {
    expect(resolveImageLink('mailto:logo.png')).toBeNull();
    expect(resolveImageLink('ftp://host/a.png')).toBeNull();
  });
});
