import { ref } from 'vue';
import {
  escapeRegExp,
  getCurrentMermaidDelimiters,
  normalizeMermaidDelimiters,
  type MermaidDelimiters,
} from '../utils/mermaid-delimiters';

/**
 * Bridge between a Mermaid diagram node and the main AI panel.
 *
 * When a user clicks the "AI" button on a mermaid diagram, the node registers
 * a target here. The main AI panel reads `target` to:
 *  - pin the diagram code as scoped context,
 *  - augment its preamble with mermaid-edit instructions,
 *  - extract a mermaid candidate from each assistant reply via `pushCandidate`,
 *  - commit it to the node via `applyCandidate` when the user clicks Apply.
 *
 * The diagram still renders the candidate live (so the user sees the proposal
 * inline), but the Apply / Stop affordances live in the AI panel chip — the
 * floating banner on the diagram itself overlapped the mermaid toolbar.
 */
export interface MermaidEditTarget {
  /** Stable id for diagnostics + de-duping. */
  id: string;
  /** Diagram code at the moment editing started — pinned in the panel. */
  initialCode: string;
  /** Commits a mermaid code candidate to the node attrs (called by Apply). */
  apply: (code: string) => void;
  /** Called when the target is cleared (Stop, panel close, node unmount, …). */
  cancel: () => void;
}

const target = ref<MermaidEditTarget | null>(null);
const candidate = ref<string | null>(null);

/** Extract mermaid source from an AI reply. */
export function extractMermaidCodeFromResponse(
  raw: string,
  mermaidDelimiters: MermaidDelimiters = getCurrentMermaidDelimiters(),
): string {
  if (!raw) return '';
  const { open, close } = normalizeMermaidDelimiters(mermaidDelimiters);
  const fenced = raw.match(new RegExp(`${escapeRegExp(open)}\\s*\\n([\\s\\S]*?)\\n${escapeRegExp(close)}(?=\\s*(?:\\n|$))`, 'i'));
  if (fenced) return fenced[1].trim();
  const anyFence = raw.match(/```[\w-]*\s*\n([\s\S]*?)```/);
  if (anyFence) return anyFence[1].trim();
  return raw.trim();
}

export function useAiMermaidTarget() {
  function requestEdit(t: MermaidEditTarget) {
    if (target.value && target.value.id !== t.id) {
      target.value.cancel();
    }
    target.value = t;
    candidate.value = null;
  }

  /** Called by AiPanel after each completed reply that yielded mermaid code. */
  function pushCandidate(code: string) {
    if (!target.value) return;
    candidate.value = code;
  }

  /** Commit the current candidate to the node and end the session. */
  function applyCandidate() {
    if (!target.value || !candidate.value) return;
    target.value.apply(candidate.value);
    candidate.value = null;
    target.value = null;
  }

  /** Drop the candidate but keep the target so the user can iterate. */
  function discardCandidate() {
    candidate.value = null;
  }

  function clear() {
    const cur = target.value;
    target.value = null;
    candidate.value = null;
    cur?.cancel();
  }

  return {
    target,
    candidate,
    requestEdit,
    pushCandidate,
    applyCandidate,
    discardCandidate,
    clear,
  };
}
