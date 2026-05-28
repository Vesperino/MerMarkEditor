import { ref } from 'vue';
import {
  createSingleFormatRegex,
  getCurrentMermaidReadFormats,
  isValidFormat,
  type MermaidFormat,
} from '../utils/mermaid-formats';

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

/** Extract mermaid source from an AI reply. The reply might use any of the
 *  formats the user has enabled (assistants don't always honour the requested
 *  delimiter), so try each one in turn before falling back to a generic fence. */
export function extractMermaidCodeFromResponse(
  raw: string,
  readFormats: MermaidFormat[] = getCurrentMermaidReadFormats(),
): string {
  if (!raw) return '';
  for (const fmt of readFormats) {
    if (!isValidFormat(fmt)) continue;
    const re = createSingleFormatRegex(fmt);
    const match = re.exec(raw);
    if (match) return match[2].trim();
  }
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
