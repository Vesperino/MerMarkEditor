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
            return decodeURIComponent(dataCode);
          }
          return element.textContent || undefined;
        },
        // Render to data-code attribute
        renderHTML: (attributes) => {
          if (!attributes.code) return {};
          return {
            "data-code": encodeURIComponent(attributes.code),
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
          return {
            code: dataCode ? decodeURIComponent(dataCode) : undefined,
          };
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
