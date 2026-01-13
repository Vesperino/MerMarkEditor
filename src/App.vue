<script setup lang="ts">
import Editor from "./components/Editor.vue";
import Toolbar from "./components/Toolbar.vue";
import { ref, provide, computed, watchEffect, watch, onMounted, onUnmounted } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Editor as TiptapEditor } from "@tiptap/vue-3";

const editorRef = ref<InstanceType<typeof Editor> | null>(null);
const editorInstance = ref<TiptapEditor | null>(null);
const currentFile = ref<string | null>(null);
const hasChanges = ref(false);
const content = ref("<p></p>");

// Watch for editor instance changes
watch(
  () => editorRef.value?.editor,
  (newEditor) => {
    if (newEditor) {
      editorInstance.value = newEditor as unknown as TiptapEditor;
    }
  },
  { immediate: true }
);

provide("editor", editorInstance);
provide("currentFile", currentFile);
provide("hasChanges", hasChanges);

const windowTitle = computed(() => {
  const fileName = currentFile.value?.split(/[/\\]/).pop() || "Nowy dokument";
  const changeIndicator = hasChanges.value ? " *" : "";
  return `${fileName}${changeIndicator} - MdReader`;
});

// Update window title
watchEffect(() => {
  document.title = windowTitle.value;
});

// Helper: Decode HTML entities
const decodeHtmlEntities = (text: string): string => {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
};

const htmlToMarkdown = (html: string): string => {
  let md = html;

  // Normalize line endings (Windows \r\n to \n)
  md = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Mermaid blocks - must be first
  md = md.replace(/<div[^>]*data-type="mermaid"[^>]*>[\s\S]*?<\/div>/gi, (match) => {
    const codeMatch = match.match(/data-code="([^"]*)"/);
    if (codeMatch) {
      return "\n```mermaid\n" + decodeURIComponent(codeMatch[1]) + "\n```\n";
    }
    return "";
  });

  // Code blocks - must be before inline code, decode HTML entities in code content
  md = md.replace(/<pre[^>]*><code[^>]*(?:\sclass="language-(\w+)")?[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, lang, code) => {
    const decodedCode = decodeHtmlEntities(code);
    const langSpec = lang ? lang : "";
    return `\n\`\`\`${langSpec}\n${decodedCode}\n\`\`\`\n`;
  });

  // Tables
  md = md.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
    let result = "\n";
    const rows = tableContent.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    let isHeader = true;

    rows.forEach((row: string, index: number) => {
      const cells = row.match(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi) || [];
      const cellValues = cells.map((cell: string) => {
        return cell.replace(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/i, "$1")
          .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1")
          .replace(/<[^>]+>/g, "")
          .trim();
      });

      result += "| " + cellValues.join(" | ") + " |\n";

      if (isHeader && index === 0) {
        result += "| " + cellValues.map(() => "---").join(" | ") + " |\n";
        isHeader = false;
      }
    });

    return result + "\n";
  });

  // Task lists - fix checkbox detection (must match exact attribute value)
  md = md.replace(/<ul[^>]*data-type="taskList"[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    let result = "\n";
    const items = content.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
    items.forEach((item: string) => {
      // Only check for exact data-checked="true" attribute, not partial matches
      const isChecked = /data-checked=["']true["']/i.test(item);
      const text = item.replace(/<li[^>]*>([\s\S]*?)<\/li>/i, "$1")
        .replace(/<label[^>]*>[\s\S]*?<\/label>/gi, "")
        .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1")
        .replace(/<[^>]+>/g, "")
        .trim();
      result += `- [${isChecked ? "x" : " "}] ${text}\n`;
    });
    return result;
  });

  // Regular lists - unordered
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, (_, content) => {
    let result = "\n";
    const items = content.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
    items.forEach((item: string) => {
      const text = item.replace(/<li[^>]*>([\s\S]*?)<\/li>/i, "$1")
        .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1")
        .replace(/<[^>]+>/g, "")
        .trim();
      result += `- ${text}\n`;
    });
    return result;
  });

  // Regular lists - ordered
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (_, content) => {
    let result = "\n";
    const items = content.match(/<li[^>]*>[\s\S]*?<\/li>/gi) || [];
    items.forEach((item: string, index: number) => {
      const text = item.replace(/<li[^>]*>([\s\S]*?)<\/li>/i, "$1")
        .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1")
        .replace(/<[^>]+>/g, "")
        .trim();
      result += `${index + 1}. ${text}\n`;
    });
    return result;
  });

  // Headers
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, content) => `\n# ${content.replace(/<[^>]+>/g, "").trim()}\n\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, content) => `\n## ${content.replace(/<[^>]+>/g, "").trim()}\n\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, content) => `\n### ${content.replace(/<[^>]+>/g, "").trim()}\n\n`);
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, content) => `\n#### ${content.replace(/<[^>]+>/g, "").trim()}\n\n`);
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, content) => `\n##### ${content.replace(/<[^>]+>/g, "").trim()}\n\n`);
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, content) => `\n###### ${content.replace(/<[^>]+>/g, "").trim()}\n\n`);

  // Blockquote
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const text = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1").replace(/<[^>]+>/g, "").trim();
    return `\n> ${text}\n\n`;
  });

  // Horizontal rule
  md = md.replace(/<hr[^>]*\/?>/gi, "\n---\n");

  // Bold, italic, strike (pure Markdown only)
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<s[^>]*>(.*?)<\/s>/gi, "~~$1~~");
  md = md.replace(/<del[^>]*>(.*?)<\/del>/gi, "~~$1~~");
  md = md.replace(/<strike[^>]*>(.*?)<\/strike>/gi, "~~$1~~");

  // Remove unsupported HTML tags (no Markdown equivalent - strip them)
  md = md.replace(/<sup[^>]*>(.*?)<\/sup>/gi, "$1");
  md = md.replace(/<sub[^>]*>(.*?)<\/sub>/gi, "$1");
  md = md.replace(/<u[^>]*>(.*?)<\/u>/gi, "$1");
  md = md.replace(/<mark[^>]*>(.*?)<\/mark>/gi, "$1");

  // Inline code
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");

  // Links and images
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");
  md = md.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, "![$1]($2)");
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)");

  // Paragraphs and line breaks
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<br[^>]*\/?>/gi, "  \n");

  // Remove remaining span tags but keep content (colors/fonts don't have Markdown equivalent)
  md = md.replace(/<span[^>]*>(.*?)<\/span>/gi, "$1");

  // Remove any remaining div tags
  md = md.replace(/<\/?div[^>]*>/gi, "\n");

  // Clean up HTML entities
  md = md.replace(/&nbsp;/g, " ");
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');

  // Clean up extra whitespace
  md = md.replace(/\n{3,}/g, "\n\n");
  md = md.trim();

  return md;
};

// Helper: Escape HTML entities (but not inside code blocks)
const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

const markdownToHtml = (md: string): string => {
  let html = md;

  // Normalize line endings first
  html = html.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Extract and protect code blocks FIRST (before escaping HTML)
  // Store them with placeholders to prevent modification
  const codeBlocks: string[] = [];

  // Mermaid blocks - extract first
  html = html.replace(/```mermaid\n([\s\S]*?)```/gi, (_, code) => {
    const placeholder = `__MERMAID_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`<div data-type="mermaid" data-code="${encodeURIComponent(code.trim())}"></div>`);
    return placeholder;
  });

  // Regular code blocks - extract and store
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/gi, (_, lang, code) => {
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    // Escape HTML inside code blocks
    const escapedCode = escapeHtml(code);
    codeBlocks.push(`<pre><code class="language-${lang || 'plaintext'}">${escapedCode}</code></pre>`);
    return placeholder;
  });

  // Now escape HTML in the remaining content (not in code blocks)
  html = escapeHtml(html);

  // Tables (GFM style)
  html = html.replace(/^\|(.+)\|\n\|([\s\-:|]+)\|\n((?:\|.+\|\n?)*)/gim, (match) => {
    const lines = match.trim().split("\n");
    if (lines.length < 2) return match;

    let result = '<table class="editor-table">';

    // Header row
    const headerCells = lines[0].split("|").filter(c => c.trim());
    result += "<thead><tr>";
    headerCells.forEach(cell => {
      result += `<th><p>${cell.trim()}</p></th>`;
    });
    result += "</tr></thead>";

    // Body rows (skip separator line at index 1)
    if (lines.length > 2) {
      result += "<tbody>";
      for (let i = 2; i < lines.length; i++) {
        const cells = lines[i].split("|").filter(c => c.trim());
        if (cells.length > 0) {
          result += "<tr>";
          cells.forEach(cell => {
            result += `<td><p>${cell.trim()}</p></td>`;
          });
          result += "</tr>";
        }
      }
      result += "</tbody>";
    }

    result += "</table>";
    return result;
  });

  // Task lists
  html = html.replace(/^- \[([ x])\] (.*)$/gim, (_, checked, text) => {
    const isChecked = checked === "x";
    return `<li data-type="taskItem" data-checked="${isChecked}"><label><input type="checkbox" ${isChecked ? "checked" : ""}></label><p>${text}</p></li>`;
  });

  // Wrap consecutive task items in task list
  html = html.replace(/(<li data-type="taskItem"[^>]*>[\s\S]*?<\/li>\n?)+/g, '<ul data-type="taskList">$&</ul>');

  // Headers
  html = html.replace(/^###### (.*$)/gim, "<h6>$1</h6>");
  html = html.replace(/^##### (.*$)/gim, "<h5>$1</h5>");
  html = html.replace(/^#### (.*$)/gim, "<h4>$1</h4>");
  html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
  html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
  html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

  // Bold, italic, strike
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links and images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="editor-image" src="$2" alt="$1" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="editor-link" href="$2">$1</a>');

  // Horizontal rule
  html = html.replace(/^---$/gim, "<hr />");

  // Blockquotes
  html = html.replace(/^&gt; (.*$)/gim, "<blockquote><p>$1</p></blockquote>");

  // Regular unordered lists
  html = html.replace(/^- (.*)$/gim, "<li><p>$1</p></li>");
  html = html.replace(/(<li><p>(?!.*data-type)[\s\S]*?<\/p><\/li>\n?)+/g, (match) => {
    if (!match.includes('data-type="taskItem"')) {
      return `<ul>${match}</ul>`;
    }
    return match;
  });

  // Ordered lists
  html = html.replace(/^\d+\. (.*)$/gim, "<li><p>$1</p></li>");

  // Paragraphs - wrap remaining text lines
  html = html.replace(/^(?!<[huplodtb]|<\/|<hr|<img|<a |<code|<strong|<em|<s>|__)(.+)$/gim, "<p>$1</p>");

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");

  // Restore code blocks from placeholders
  codeBlocks.forEach((block, index) => {
    html = html.replace(`__MERMAID_BLOCK_${index}__`, block);
    html = html.replace(`__CODE_BLOCK_${index}__`, block);
  });

  return html;
};

const openFile = async () => {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Markdown", extensions: ["md", "markdown"] },
        { name: "Wszystkie pliki", extensions: ["*"] },
      ],
    });

    if (selected) {
      const fileContent = await readTextFile(selected as string);
      content.value = markdownToHtml(fileContent);
      currentFile.value = selected as string;
      hasChanges.value = false;

      if (editorRef.value?.editor) {
        editorRef.value.editor.commands.setContent(content.value);
      }
    }
  } catch (error) {
    console.error("Błąd otwierania pliku:", error);
  }
};

const saveFile = async () => {
  try {
    let filePath = currentFile.value;

    if (!filePath) {
      filePath = await save({
        filters: [
          { name: "Markdown", extensions: ["md"] },
        ],
        defaultPath: "dokument.md",
      });
    }

    if (filePath) {
      const html = editorRef.value?.editor?.getHTML() || "";
      const markdown = htmlToMarkdown(html);
      await writeTextFile(filePath, markdown);
      currentFile.value = filePath;
      hasChanges.value = false;
    }
  } catch (error) {
    console.error("Błąd zapisywania pliku:", error);
  }
};

const exportPdf = async () => {
  // Używamy systemowego dialogu drukowania z opcją zapisu do PDF
  // Użytkownik może wybrać "Zapisz jako PDF" w opcjach drukarki
  window.print();
};

const onContentUpdate = (newContent: string) => {
  content.value = newContent;
};

const onChangesUpdate = (changed: boolean) => {
  hasChanges.value = changed;
};

// Keyboard shortcuts
const handleKeyboard = (event: KeyboardEvent) => {
  // Check for Ctrl (Windows/Linux) or Cmd (Mac)
  const modifier = event.ctrlKey || event.metaKey;

  if (modifier) {
    switch (event.key.toLowerCase()) {
      case 's':
        event.preventDefault();
        saveFile();
        break;
      case 'o':
        event.preventDefault();
        openFile();
        break;
      case 'p':
        event.preventDefault();
        exportPdf();
        break;
    }
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeyboard);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboard);
});
</script>

<template>
  <div class="app">
    <Toolbar
      @open-file="openFile"
      @save-file="saveFile"
      @export-pdf="exportPdf"
    />
    <Editor
      ref="editorRef"
      :model-value="content"
      @update:model-value="onContentUpdate"
      @update:has-changes="onChangesUpdate"
    />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #ffffff;
}

@media print {
  .app {
    height: auto !important;
    overflow: visible !important;
    display: block !important;
  }

  .toolbar {
    display: none !important;
  }

  /* Unikaj dzielenia nagłówków i bloków kodu */
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid;
  }

  pre, blockquote, table, .mermaid-wrapper {
    page-break-inside: avoid;
    break-inside: avoid;
  }
}
</style>
