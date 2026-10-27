import { diffArrays, diffChars } from 'diff';

/** Align lexical text first, then diff only the punctuation/whitespace between
 * matches. Wrapping and alternate Markdown delimiters otherwise create a huge
 * edit distance in a whole-document character diff. Words are compared in
 * sequence (including duplicates), never looked up by their first occurrence.
 * Diff stages and periodic linear-work checks share a cooperative deadline;
 * uncertain alignments still fall back to the validated serializer. */
export function sourceBoundaries(source: string, generated: string) {
  const deadline = Date.now() + 200;
  // Tag/comment words are syntax, not visible text anchors. Keep their source
  // offsets intact and align those gaps by characters (also inside code).
  const tokens = (text: string) => {
    const result: RegExpExecArray[] = [];
    // Do not search past another '<' for a tag end. Unclosed tags/comments
    // must remain a linear scan, including when many openers are repeated.
    const pattern = /<!--|<\/?[a-z][^<>\n]*>|[\p{L}\p{N}]+/giu;
    let token;
    let count = 0;
    while ((token = pattern.exec(text)) !== null) {
      if ((count++ & 2047) === 0 && Date.now() >= deadline) return null;
      if (token[0] === '<!--') {
        const end = text.indexOf('-->', pattern.lastIndex);
        if (end < 0) break;
        pattern.lastIndex = end + 3;
      } else if (!token[0].startsWith('<')) result.push(token);
    }
    return result;
  };
  const originalTokens = tokens(source);
  if (!originalTokens) return null;
  const generatedTokens = tokens(generated);
  if (!generatedTokens || Date.now() >= deadline) return null;
  const changes = diffArrays(originalTokens.map(t => t[0]), generatedTokens.map(t => t[0]), {
    timeout: Math.max(1, Math.min(50, deadline - Date.now())),
  });
  if (!changes || Date.now() >= deadline) return null;

  const left = new Uint32Array(generated.length + 1);
  const right = new Uint32Array(generated.length + 1);
  let original = 0;
  let offset = 0;
  const alignGap = (end: number, generatedEnd: number) => {
    if (original === end && offset === generatedEnd) return true;
    const before = source.slice(original, end);
    const after = generated.slice(offset, generatedEnd);
    // Most gaps are an identical space, or a one-character soft line break.
    // Avoid setting up Myers' algorithm for every word in a long document.
    if (before === after) {
      while (offset < generatedEnd) {
        original++;
        offset++;
        left[offset] = right[offset] = original;
      }
      return true;
    }
    if (before.length <= 1 && after.length <= 1) {
      original = end;
      right[offset] = original;
      if (offset < generatedEnd) {
        offset++;
        left[offset] = right[offset] = original;
      }
      return true;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return false;
    const gap = diffChars(before, after, { timeout: remaining });
    if (!gap) return false;
    for (const change of gap) {
      if (change.removed) {
        original += change.value.length;
        right[offset] = original;
      } else {
        for (let i = 0; i < change.value.length; i++) {
          if (!change.added) original++;
          offset++;
          left[offset] = right[offset] = original;
        }
      }
    }
    return true;
  };
  let originalToken = 0;
  let generatedToken = 0;
  for (const change of changes) {
    if (change.removed) originalToken += change.value.length;
    else if (change.added) generatedToken += change.value.length;
    else {
      for (let i = 0; i < change.value.length; i++) {
        if ((i & 255) === 0 && Date.now() >= deadline) return null;
        const a = originalTokens[originalToken++];
        const b = generatedTokens[generatedToken++];
        if (!alignGap(a.index, b.index)) return null;
        for (let j = 0; j < a[0].length; j++) {
          original++;
          offset++;
          left[offset] = right[offset] = original;
        }
      }
    }
  }
  if (!alignGap(source.length, generated.length) || Date.now() >= deadline) return null;
  return { left, right };
}
