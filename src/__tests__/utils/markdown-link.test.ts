import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { isAllowedMarkdownLink } from '../../utils/markdown-link';

describe('Markdown links in the visual editor', () => {
  it.each(['docs/guide.md', '../README.md', '#section', 'https://example.com', 'mailto:user@example.com'])('retains %s', (href) => {
    const editor = new Editor({
      extensions: [StarterKit.configure({ link: false }), Link.configure({ isAllowedUri: isAllowedMarkdownLink })],
      content: `<p><a href="${href}">Link</a></p>`,
    });
    try { expect(editor.getHTML()).toContain(`href="${href}"`); }
    finally { editor.destroy(); }
  });

  it.each(['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,test', 'vbscript:msgbox(1)'])('rejects %s', (href) => {
    const editor = new Editor({
      extensions: [StarterKit.configure({ link: false }), Link.configure({ isAllowedUri: isAllowedMarkdownLink })],
      content: `<p><a href="${href}">Link</a></p>`,
    });
    try { expect(editor.getHTML()).toBe('<p>Link</p>'); }
    finally { editor.destroy(); }
  });
});
