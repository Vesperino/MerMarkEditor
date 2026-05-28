import { describe, expect, it } from 'vitest';
import { extractMermaidCodeFromResponse } from '../../composables/useAiMermaidTarget';

describe('extractMermaidCodeFromResponse', () => {
  it('extracts Mermaid using default delimiters', () => {
    const result = extractMermaidCodeFromResponse('```mermaid\nflowchart TD\n  A --> B\n```');
    expect(result).toBe('flowchart TD\n  A --> B');
  });

  it('extracts Mermaid using configured delimiters', () => {
    const result = extractMermaidCodeFromResponse(
      ':::mermaid\nflowchart TD\n  A --> B\n:::',
      [{ id: 'admonition', open: ':::mermaid', close: ':::', label: 'Admonition', builtin: true }],
    );
    expect(result).toBe('flowchart TD\n  A --> B');
  });
});
