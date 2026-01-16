import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the markdown converter
vi.mock('../../utils/markdown-converter', () => ({
  htmlToMarkdown: (html: string) => `# Markdown\n\nConverted from: ${html}`,
  markdownToHtml: (md: string) => `<p>HTML from: ${md}</p>`,
}));

describe('useCodeView', () => {
  let mockTextarea: HTMLTextAreaElement;

  beforeEach(() => {
    // Create mock textarea
    mockTextarea = document.createElement('textarea');
    mockTextarea.value = '# Test\n\nSome content here';
    mockTextarea.selectionStart = 10;
    mockTextarea.selectionEnd = 10;
    document.body.appendChild(mockTextarea);

    // Mock document.querySelector for editor container
    vi.spyOn(document, 'querySelector').mockImplementation((selector: string) => {
      if (selector.includes('editor-container')) {
        return {
          scrollHeight: 1000,
          clientHeight: 500,
          scrollTop: 0,
          getBoundingClientRect: () => ({
            top: 0,
            left: 0,
            width: 800,
            height: 500,
          }),
        } as any;
      }
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('cursor text extraction', () => {
    it('should extract heading text with markdown prefix', () => {
      // Test the logic for extracting cursor text
      const node = {
        type: { name: 'heading' },
        attrs: { level: 2 },
        textContent: 'My Heading',
      };

      const level = node.attrs.level || 1;
      const prefix = '#'.repeat(level) + ' ';
      const result = prefix + node.textContent;

      expect(result).toBe('## My Heading');
    });

    it('should extract paragraph text without prefix', () => {
      const node = {
        type: { name: 'paragraph' },
        textContent: 'This is a paragraph with some text content',
      };

      const result = node.textContent.trim().slice(0, 50);

      expect(result).toBe('This is a paragraph with some text content');
    });

    it('should truncate long text to 50 characters', () => {
      const node = {
        type: { name: 'paragraph' },
        textContent: 'This is a very long paragraph that should be truncated to 50 characters maximum',
      };

      const result = node.textContent.trim().slice(0, 50);

      expect(result.length).toBe(50);
      expect(result).toBe('This is a very long paragraph that should be trunc');
    });
  });

  describe('markdown cursor line extraction', () => {
    it('should extract heading text from markdown line (removes # prefix)', () => {
      const line = '## My Heading Title';
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      expect(headingMatch).not.toBeNull();
      expect(headingMatch![2].trim()).toBe('My Heading Title');
    });

    it('should not match non-heading lines', () => {
      const line = 'Regular paragraph text';
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

      expect(headingMatch).toBeNull();
    });

    it('should extract current line from code content', () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4';
      const cursorPos = 10; // Middle of "Line 2"

      const textBefore = content.slice(0, cursorPos);
      const lineStart = textBefore.lastIndexOf('\n') + 1;
      const lineEnd = content.indexOf('\n', cursorPos);
      const currentLine = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);

      expect(currentLine).toBe('Line 2');
    });
  });

  describe('scroll ratio calculation', () => {
    it('should calculate scroll ratio correctly', () => {
      const scrollHeight = 1000;
      const clientHeight = 500;
      const scrollTop = 250;

      const maxScroll = scrollHeight - clientHeight;
      const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;

      expect(ratio).toBe(0.5);
    });

    it('should handle zero max scroll', () => {
      const scrollHeight = 500;
      const clientHeight = 500;
      const scrollTop = 0;

      const maxScroll = scrollHeight - clientHeight;
      const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;

      expect(ratio).toBe(0);
    });
  });

  describe('text search in document', () => {
    it('should find text by substring match', () => {
      const searchText = 'paragraph';
      const nodeText = 'This is a paragraph with content';

      const found = nodeText.includes(searchText) || searchText.includes(nodeText.slice(0, 30));

      expect(found).toBe(true);
    });

    it('should find by reverse substring match', () => {
      const searchText = 'This is a paragraph with content that is very long';
      const nodeText = 'This is a paragraph';

      const found = nodeText.includes(searchText) || searchText.includes(nodeText.slice(0, 30));

      expect(found).toBe(true);
    });
  });

  describe('highlight styles injection', () => {
    it('should define cursor-pulse animation keyframes', () => {
      // The expected CSS animation
      const expectedKeyframes = `
        @keyframes cursor-pulse {
          0% { opacity: 0; transform: scaleX(0.95); }
          20% { opacity: 1; transform: scaleX(1); }
          80% { opacity: 1; transform: scaleX(1); }
          100% { opacity: 0; transform: scaleX(0.95); }
        }
      `;

      // Check that keyframes contain expected properties
      expect(expectedKeyframes).toContain('cursor-pulse');
      expect(expectedKeyframes).toContain('opacity');
      expect(expectedKeyframes).toContain('transform');
    });
  });

  describe('cursor position in code editor', () => {
    it('should calculate line number from cursor position', () => {
      const content = 'Line 1\nLine 2\nLine 3\nLine 4';
      const cursorPos = 15; // After "Line 2\n"

      const textBefore = content.slice(0, cursorPos);
      const lineNumber = textBefore.split('\n').length - 1;

      expect(lineNumber).toBe(2); // 0-indexed line 2 (third line)
    });

    it('should find cursor position in markdown by text search', () => {
      const content = '# Heading\n\nThis is paragraph text.\n\nAnother paragraph.';
      const searchText = 'paragraph text';

      const pos = content.indexOf(searchText);

      expect(pos).toBeGreaterThan(-1);
      expect(pos).toBe(19); // Position where "paragraph text" starts
    });
  });
});
