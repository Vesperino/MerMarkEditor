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
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="mermaid"]',
        getAttrs: (dom) => {
          if (typeof dom === "string") return {};
          const dataCode = dom.getAttribute("data-code");
          if (dataCode) {
            // Preserve code as-is - <br> tags are valid mermaid syntax
            return { code: decodeURIComponent(dataCode) };
          }
          return { code: undefined };
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
