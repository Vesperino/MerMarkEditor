import { describe, it, expect } from 'vitest';
import { parseAiOutput } from '../../composables/useAiOutputParser';

describe('parseAiOutput', () => {
  it('returns plain when no fence present', () => {
    const r = parseAiOutput('Just text.');
    expect(r.kind).toBe('plain');
  });

  it('extracts mermark-replace block', () => {
    const r = parseAiOutput('Header\n```mermark-replace\nNew content\n```\nfooter');
    expect(r.kind).toBe('replace');
    if (r.kind === 'replace') expect(r.payload).toBe('New content\n');
  });

  it('extracts mermark-patch block', () => {
    const r = parseAiOutput('```mermark-patch\n--- a\n+++ b\n@@\n-old\n+new\n```');
    expect(r.kind).toBe('patch');
    if (r.kind === 'patch') expect(r.payload).toContain('-old');
  });

  it('replace takes precedence when both fences present', () => {
    const r = parseAiOutput('```mermark-replace\nA\n```\n```mermark-patch\nB\n```');
    expect(r.kind).toBe('replace');
  });
});
