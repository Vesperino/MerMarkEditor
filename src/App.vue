<script setup lang="ts">
import Editor from "./components/Editor.vue";
import Toolbar from "./components/Toolbar.vue";
import { ref, provide, computed } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

const editorRef = ref<InstanceType<typeof Editor> | null>(null);
const currentFile = ref<string | null>(null);
const hasChanges = ref(false);
const content = ref("<p></p>");

provide("currentFile", currentFile);
provide("hasChanges", hasChanges);

const windowTitle = computed(() => {
  const fileName = currentFile.value?.split(/[/\\]/).pop() || "Nowy dokument";
  const changeIndicator = hasChanges.value ? " *" : "";
  return `${fileName}${changeIndicator} - MdReader`;
});

const htmlToMarkdown = (html: string): string => {
  let md = html;

  // Headers
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  md = md.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n");
  md = md.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n\n");
  md = md.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n\n");

  // Bold, italic, underline, strike
  md = md.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  md = md.replace(/<u[^>]*>(.*?)<\/u>/gi, "<u>$1</u>");
  md = md.replace(/<s[^>]*>(.*?)<\/s>/gi, "~~$1~~");
  md = md.replace(/<del[^>]*>(.*?)<\/del>/gi, "~~$1~~");

  // Code
  md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");
  md = md.replace(/<pre[^>]*><code[^>]*>(.*?)<\/code><\/pre>/gis, "```\n$1\n```\n\n");

  // Links and images
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");
  md = md.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)");

  // Lists
  md = md.replace(/<ul[^>]*>/gi, "\n");
  md = md.replace(/<\/ul>/gi, "\n");
  md = md.replace(/<ol[^>]*>/gi, "\n");
  md = md.replace(/<\/ol>/gi, "\n");
  md = md.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");

  // Blockquote
  md = md.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, "> $1\n\n");

  // Horizontal rule
  md = md.replace(/<hr[^>]*\/?>/gi, "\n---\n\n");

  // Paragraphs and line breaks
  md = md.replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<br[^>]*\/?>/gi, "\n");

  // Mermaid blocks
  md = md.replace(/<div[^>]*data-type="mermaid"[^>]*data-code="([^"]*)"[^>]*>.*?<\/div>/gis,
    (_, code) => "```mermaid\n" + decodeURIComponent(code) + "\n```\n\n");

  // Clean up remaining tags and entities
  md = md.replace(/<[^>]+>/g, "");
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

const markdownToHtml = (md: string): string => {
  let html = md;

  // Mermaid blocks
  html = html.replace(/```mermaid\n([\s\S]*?)```/gi, (_, code) => {
    return `<div data-type="mermaid" data-code="${encodeURIComponent(code.trim())}"></div>`;
  });

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/gi, "<pre><code>$2</code></pre>");

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
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Horizontal rule
  html = html.replace(/^---$/gim, "<hr />");

  // Blockquotes
  html = html.replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>");

  // Lists
  html = html.replace(/^- (.*$)/gim, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Paragraphs
  html = html.replace(/^(?!<[huplob]|<\/|<hr)(.+)$/gim, "<p>$1</p>");

  // Line breaks
  html = html.replace(/\n\n/g, "</p><p>");

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
  try {
    const filePath = await save({
      filters: [
        { name: "PDF", extensions: ["pdf"] },
      ],
      defaultPath: "dokument.pdf",
    });

    if (filePath) {
      window.print();
    }
  } catch (error) {
    console.error("Błąd eksportu PDF:", error);
  }
};

const onContentUpdate = (newContent: string) => {
  content.value = newContent;
};

const onChangesUpdate = (changed: boolean) => {
  hasChanges.value = changed;
};
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
  .toolbar {
    display: none !important;
  }

  .editor-container {
    padding: 0 !important;
  }

  .editor-content {
    max-width: 100% !important;
    padding: 20px !important;
  }
}
</style>
