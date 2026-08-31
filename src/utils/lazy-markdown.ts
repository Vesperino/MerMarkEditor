import { safeHtmlTagTokens } from './safe-html';
import { findMath } from './math';

export interface MarkdownChunk {
  markdown: string;
  lineCount: number;
}

const TARGET_CHUNK_CHARS = 24 * 1024;
const MAX_CHUNK_CHARS = TARGET_CHUNK_CHARS * 2;

/**
 * Split at block boundaries without cutting fenced code or supported raw HTML
 * blocks. Each chunk can be converted independently, keeping large-file
 * preview work bounded.
 */
export function splitMarkdownForLazyPreview(markdown: string): MarkdownChunk[] {
  if (!markdown) return [{ markdown: '', lineCount: 1 }];

  const lines = markdown.split('\n');
  const chunks: MarkdownChunk[] = [];
  let start = 0;
  let chars = 0;
  let fenceChar = '';
  let fenceLength = 0;
  let safeHtmlDepth = 0;
  const math = findMath(markdown);
  let mathIndex = 0;
  let offset = 0;

  const push = (endExclusive: number) => {
    const chunkLines = lines.slice(start, endExclusive);
    chunks.push({ markdown: chunkLines.join('\n'), lineCount: Math.max(1, chunkLines.length) });
    start = endExclusive;
    chars = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    chars += line.length + 1;
    offset += line.length + 1;
    while (mathIndex < math.length && math[mathIndex].end < offset) mathIndex++;
    const insideMath = mathIndex < math.length && math[mathIndex].start < offset && math[mathIndex].end >= offset;

    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const marker = fence[1];
      if (!fenceChar) {
        fenceChar = marker[0];
        fenceLength = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLength) {
        fenceChar = '';
        fenceLength = 0;
      }
    }

    if (!fenceChar) {
      for (const tag of safeHtmlTagTokens(line)) {
        if (tag.name !== 'p' && tag.name !== 'details') continue;
        if (tag.closing) safeHtmlDepth = Math.max(0, safeHtmlDepth - 1);
        else if (!tag.selfClosing) safeHtmlDepth++;
      }
    }

    if (fenceChar || safeHtmlDepth || insideMath || chars < TARGET_CHUNK_CHARS) continue;
    const atBlockBoundary = line.trim() === '';
    if (atBlockBoundary || chars >= MAX_CHUNK_CHARS) push(i + 1);
  }

  if (start < lines.length) push(lines.length);
  return chunks;
}
