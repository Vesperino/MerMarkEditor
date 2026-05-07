import { Node, mergeAttributes } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import MermaidNode from "../components/MermaidNode.vue";

export interface MermaidOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mermaid: {
      insertMermaid: (code?: string) => ReturnType;
    };
  }
}

export const MermaidExtension = Node.create<MermaidOptions>({
  name: "mermaid",

  group: "block",

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      code: {
        default: "graph LR\n  A[Start] --> B[End]",
        // Parse from data-code attribute
        parseHTML: (element) => {
          const dataCode = element.getAttribute("data-code");
          if (dataCode) {
            // Decode the URL-encoded code - preserve <br> tags as they are valid mermaid syntax
            return decodeURIComponent(dataCode);
          }
          return element.textContent || undefined;
        },
        // Render to data-code attribute
        renderHTML: (attributes) => {
          if (!attributes.code) return {};
          // Preserve code as-is - <br> tags are valid mermaid syntax for line breaks in messages
          return {
            "data-code": encodeURIComponent(attributes.code),
          };
        },
      },
      printScale: {
        // Default to 100 % so freshly inserted / pasted diagrams render at
        // full size. Earlier versions defaulted to 25 % which made small
        // diagrams look broken; users rarely want anything below 100 %
        // until they're laying out a print-heavy page.
        default: 100,
        parseHTML: (element) => {
          const scale = element.getAttribute("data-print-scale");
          return scale ? parseInt(scale, 10) : 100;
        },
        renderHTML: (attributes) => {
          return {
            "data-print-scale": attributes.printScale || 100,
          };
        },
      },
      /**
       * User-resized width in pixels. `null` means "auto" (use natural diagram
       * width). Persisted into the saved markdown via `data-user-width` so
       * reopening the file restores the same layout the user dragged to.
       */
      userWidth: {
        default: null as number | null,
        parseHTML: (element) => {
          const w = element.getAttribute("data-user-width");
          if (!w) return null;
          const n = parseInt(w, 10);
          return Number.isFinite(n) && n > 0 ? n : null;
        },
        renderHTML: (attributes) => {
          if (!attributes.userWidth) return {};
          return { "data-user-width": String(attributes.userWidth) };
        },
      },
      /**
       * Code-vs-preview split ratio (%) for the fullscreen editor. Default 50.
       * Persisted so reopening a file remembers the user's preferred split.
       * Clamped to 20–80 % both at load and at drag time.
       */
      splitRatio: {
        default: 50,
        parseHTML: (element) => {
          const r = element.getAttribute("data-split-ratio");
          if (!r) return 50;
          const n = parseFloat(r);
          if (!Number.isFinite(n)) return 50;
          return Math.max(20, Math.min(80, Math.round(n)));
        },
        renderHTML: (attributes) => {
          if (!attributes.splitRatio || attributes.splitRatio === 50) return {};
          return { "data-split-ratio": String(attributes.splitRatio) };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid"]',
        getAttrs: (dom) => {
          if (typeof dom === "string") return {};
          const result: Record<string, unknown> = {};
          const dataCode = dom.getAttribute("data-code");
          if (dataCode) {
            // Preserve code as-is - <br> tags are valid mermaid syntax
            result.code = decodeURIComponent(dataCode);
          }
          const dataWidth = dom.getAttribute("data-user-width");
          if (dataWidth) {
            const n = parseInt(dataWidth, 10);
            if (Number.isFinite(n) && n > 0) result.userWidth = n;
          }
          const dataScale = dom.getAttribute("data-print-scale");
          if (dataScale) {
            const n = parseInt(dataScale, 10);
            if (Number.isFinite(n)) result.printScale = n;
          }
          const dataSplit = dom.getAttribute("data-split-ratio");
          if (dataSplit) {
            const n = parseFloat(dataSplit);
            if (Number.isFinite(n)) result.splitRatio = Math.max(20, Math.min(80, Math.round(n)));
          }
          return result;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "mermaid",
      }),
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(MermaidNode as any);
  },

  addCommands() {
    return {
      insertMermaid:
        (code?: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              code: code || "graph LR\n  A[Start] --> B[End]",
            },
          });
        },
    };
  },
});
