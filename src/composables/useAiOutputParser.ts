export type ParsedOutput =
  | { kind: 'plain'; text: string }
  | { kind: 'replace'; text: string; payload: string }
  | { kind: 'patch'; text: string; payload: string };

const FENCE_REPLACE = /```mermark-replace\n([\s\S]*?)```/;
const FENCE_PATCH = /```mermark-patch\n([\s\S]*?)```/;

/**
 * Parse a final assistant response text. The first matching fence wins.
 * Returns the original text plus the kind/payload when a fence is found.
 */
export function parseAiOutput(text: string): ParsedOutput {
  const replace = text.match(FENCE_REPLACE);
  if (replace) return { kind: 'replace', text, payload: replace[1] };
  const patch = text.match(FENCE_PATCH);
  if (patch) return { kind: 'patch', text, payload: patch[1] };
  return { kind: 'plain', text };
}
