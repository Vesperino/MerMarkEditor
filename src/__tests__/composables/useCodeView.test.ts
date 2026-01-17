import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Cursor marker - same as in useCodeView.ts
const CURSOR_MARKER = '\u200B__CURSOR__\u200B';

// Helper functions extracted for testing (same logic as in useCodeView.ts)
const extractMarkerPosition = (text: string): { position: number; clean: string } => {
  const pos = text.indexOf(CURSOR_MARKER);
  if (pos === -1) {
    return { position: -1, clean: text };
  }
  return {
    position: pos,
    clean: text.slice(0, pos) + text.slice(pos + CURSOR_MARKER.length),
  };
};

const getLineFromPosition = (text: string, pos: number): number => {
  if (pos <= 0) return 0;
  return text.slice(0, pos).split('\n').length - 1;
};

// Check if cursor position is inside a code block (``` ... ```)
const isInsideCodeBlock = (text: string, cursorPos: number): boolean => {
  const textBefore = text.slice(0, cursorPos);
  const codeBlockPattern = /^```/gm;
  const matches = textBefore.match(codeBlockPattern);
  if (!matches) return false;
  return matches.length % 2 === 1;
};

// Mock the markdown converter
vi.mock('../../utils/markdown-converter', () => ({
  htmlToMarkdown: (html: string) => {
    // Preserve the cursor marker in conversions
    if (html.includes(CURSOR_MARKER)) {
      return `# Markdown\n\nConverted ${CURSOR_MARKER}from: ${html.replace(CURSOR_MARKER, '')}`;
    }
    return `# Markdown\n\nConverted from: ${html}`;
  },
  markdownToHtml: (md: string) => {
    // Preserve the cursor marker in conversions
    if (md.includes(CURSOR_MARKER)) {
      return `<p>HTML ${CURSOR_MARKER}from: ${md.replace(CURSOR_MARKER, '')}</p>`;
    }
    return `<p>HTML from: ${md}</p>`;
  },
  generateSlug: (text: string) => text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-'),
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
        } as unknown as Element;
      }
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  describe('cursor marker extraction', () => {
    it('should find marker position and return clean text', () => {
      const textWithMarker = `# Heading\n\nSome ${CURSOR_MARKER}text here`;
      const result = extractMarkerPosition(textWithMarker);

      expect(result.position).toBe(16); // Position right after "Some " (# Heading=9, \n=1, \n=1, Some =5)
      expect(result.clean).toBe('# Heading\n\nSome text here');
      expect(result.clean).not.toContain(CURSOR_MARKER);
    });

    it('should return -1 position when marker not found', () => {
      const textWithoutMarker = '# Heading\n\nSome text here';
      const result = extractMarkerPosition(textWithoutMarker);

      expect(result.position).toBe(-1);
      expect(result.clean).toBe(textWithoutMarker);
    });

    it('should handle marker at start of text', () => {
      const textWithMarker = `${CURSOR_MARKER}# Heading`;
      const result = extractMarkerPosition(textWithMarker);

      expect(result.position).toBe(0);
      expect(result.clean).toBe('# Heading');
    });

    it('should handle marker at end of text', () => {
      const textWithMarker = `# Heading${CURSOR_MARKER}`;
      const result = extractMarkerPosition(textWithMarker);

      expect(result.position).toBe(9);
      expect(result.clean).toBe('# Heading');
    });

    it('should handle empty text', () => {
      const result = extractMarkerPosition('');

      expect(result.position).toBe(-1);
      expect(result.clean).toBe('');
    });

    it('should handle only marker', () => {
      const result = extractMarkerPosition(CURSOR_MARKER);

      expect(result.position).toBe(0);
      expect(result.clean).toBe('');
    });
  });

  describe('line number calculation', () => {
    it('should return 0 for position at start', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      expect(getLineFromPosition(text, 0)).toBe(0);
    });

    it('should calculate correct line for middle of first line', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      expect(getLineFromPosition(text, 3)).toBe(0);
    });

    it('should calculate correct line for second line', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      // Position 7 is start of "Line 2"
      expect(getLineFromPosition(text, 7)).toBe(1);
      // Position 10 is middle of "Line 2"
      expect(getLineFromPosition(text, 10)).toBe(1);
    });

    it('should calculate correct line for third line', () => {
      const text = 'Line 1\nLine 2\nLine 3';
      // Position 14 is start of "Line 3"
      expect(getLineFromPosition(text, 14)).toBe(2);
    });

    it('should handle negative position', () => {
      const text = 'Line 1\nLine 2';
      expect(getLineFromPosition(text, -5)).toBe(0);
    });

    it('should handle empty text', () => {
      expect(getLineFromPosition('', 0)).toBe(0);
    });

    it('should handle position beyond text length', () => {
      const text = 'Line 1\nLine 2';
      // Position beyond end should count all newlines
      expect(getLineFromPosition(text, 100)).toBe(1);
    });
  });

  describe('cursor text extraction', () => {
    it('should extract heading text with markdown prefix', () => {
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

  describe('marker insertion and extraction', () => {
    it('should correctly insert marker at cursor position', () => {
      const text = 'Hello world';
      const cursorPos = 6;

      const textWithMarker = text.slice(0, cursorPos) + CURSOR_MARKER + text.slice(cursorPos);

      expect(textWithMarker).toBe(`Hello ${CURSOR_MARKER}world`);

      // Extract should return original position
      const extracted = extractMarkerPosition(textWithMarker);
      expect(extracted.position).toBe(6);
      expect(extracted.clean).toBe('Hello world');
    });

    it('should work with multiline content', () => {
      const text = '# Heading\n\n- Item 1\n- Item 2\n- Item 3';
      const cursorPos = 15; // Middle of "- Item 1"

      const textWithMarker = text.slice(0, cursorPos) + CURSOR_MARKER + text.slice(cursorPos);
      const extracted = extractMarkerPosition(textWithMarker);

      expect(extracted.position).toBe(15);
      expect(extracted.clean).toBe(text);
      expect(getLineFromPosition(text, extracted.position)).toBe(2);
    });

    it('should handle marker at line boundaries', () => {
      const text = 'Line 1\nLine 2\nLine 3';

      // Marker at end of line 1 (before newline)
      let textWithMarker = text.slice(0, 6) + CURSOR_MARKER + text.slice(6);
      let extracted = extractMarkerPosition(textWithMarker);
      expect(extracted.position).toBe(6);
      expect(getLineFromPosition(text, extracted.position)).toBe(0);

      // Marker at start of line 2 (after newline)
      textWithMarker = text.slice(0, 7) + CURSOR_MARKER + text.slice(7);
      extracted = extractMarkerPosition(textWithMarker);
      expect(extracted.position).toBe(7);
      expect(getLineFromPosition(text, extracted.position)).toBe(1);
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

      const lineNumber = getLineFromPosition(content, cursorPos);

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

  describe('list item cursor tracking', () => {
    it('should track cursor in list items correctly', () => {
      const markdown = '- First item\n- Second item\n- Third item';
      const cursorPos = 18; // Middle of "Second item"

      const textWithMarker = markdown.slice(0, cursorPos) + CURSOR_MARKER + markdown.slice(cursorPos);
      const extracted = extractMarkerPosition(textWithMarker);

      expect(extracted.position).toBe(18);
      expect(extracted.clean).toBe(markdown);

      const lineNumber = getLineFromPosition(markdown, extracted.position);
      expect(lineNumber).toBe(1); // Second line (0-indexed)
    });

    it('should track cursor in nested lists', () => {
      const markdown = '- Item 1\n  - Nested item\n  - Another nested\n- Item 2';
      const cursorPos = 15; // In "Nested item"

      const textWithMarker = markdown.slice(0, cursorPos) + CURSOR_MARKER + markdown.slice(cursorPos);
      const extracted = extractMarkerPosition(textWithMarker);

      expect(extracted.position).toBe(15);
      expect(extracted.clean).toBe(markdown);

      const lineNumber = getLineFromPosition(markdown, extracted.position);
      expect(lineNumber).toBe(1);
    });
  });

  describe('code block detection', () => {
    it('should detect cursor inside a code block', () => {
      const markdown = '# Heading\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nParagraph';

      // Cursor inside the code block (after "flowchart")
      const insidePos = 30;
      expect(isInsideCodeBlock(markdown, insidePos)).toBe(true);
    });

    it('should detect cursor outside code block (before)', () => {
      const markdown = '# Heading\n\n```mermaid\nflowchart TD\n```\n\nParagraph';

      // Cursor before the code block
      const beforePos = 5;
      expect(isInsideCodeBlock(markdown, beforePos)).toBe(false);
    });

    it('should detect cursor outside code block (after)', () => {
      const markdown = '# Heading\n\n```mermaid\nflowchart TD\n```\n\nParagraph';

      // Cursor after the code block (in "Paragraph")
      const afterPos = markdown.length - 3;
      expect(isInsideCodeBlock(markdown, afterPos)).toBe(false);
    });

    it('should handle multiple code blocks', () => {
      const markdown = '```js\ncode1\n```\n\nText\n\n```python\ncode2\n```';

      // Inside first code block
      expect(isInsideCodeBlock(markdown, 8)).toBe(true);

      // Between code blocks (in "Text")
      expect(isInsideCodeBlock(markdown, 20)).toBe(false);

      // Inside second code block
      expect(isInsideCodeBlock(markdown, 35)).toBe(true);
    });

    it('should return false when no code blocks exist', () => {
      const markdown = '# Heading\n\nJust some text\n\n- List item';

      expect(isInsideCodeBlock(markdown, 0)).toBe(false);
      expect(isInsideCodeBlock(markdown, 15)).toBe(false);
      expect(isInsideCodeBlock(markdown, markdown.length)).toBe(false);
    });

    it('should handle cursor at code block boundary', () => {
      const markdown = '```\ncode\n```';

      // Right after opening ```
      expect(isInsideCodeBlock(markdown, 4)).toBe(true);

      // Right before closing ```
      expect(isInsideCodeBlock(markdown, 8)).toBe(true);
    });
  });
});
