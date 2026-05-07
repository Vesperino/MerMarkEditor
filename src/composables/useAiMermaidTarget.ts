import { ref } from 'vue';

/**
 * Bridge between a Mermaid diagram node and the main AI panel.
 *
 * When a user clicks the "AI" button on a mermaid diagram, the node registers
 * a target here. The main AI panel reads `target` to:
 *  - pin the diagram code as scoped context,
 *  - augment its preamble with mermaid-edit instructions,
 *  - hand back any returned mermaid code via `pushCandidate`.
 *
 * The node owns the preview/apply lifecycle; the singleton is just a routing
 * channel so AiPanel doesn't need to know about specific node instances.
 */
export interface MermaidEditTarget {
  /** Stable id for diagnostics + de-duping pushed candidates. */
  id: string;
  /** Diagram code at the moment editing started — pinned in the panel. */
  initialCode: string;
  /** Called by AiPanel when an assistant reply yields mermaid source. */
  pushCandidate: (code: string) => void;
  /** Called when the target is cleared (user pressed Stop, panel closed, …). */
  cancel: () => void;
}

const target = ref<MermaidEditTarget | null>(null);

/** Extract mermaid source from an AI reply. Mirrors the regex used in MermaidNode. */
export function extractMermaidCodeFromResponse(raw: string): string {
  if (!raw) return '';
  const fenced = raw.match(/```mermaid\s*\n([\s\S]*?)```/i);
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
  }

  function clear() {
    const cur = target.value;
    target.value = null;
    cur?.cancel();
  }

  return { target, requestEdit, clear };
}
