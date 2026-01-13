<script setup lang="ts">
import Editor from "./components/Editor.vue";
import Toolbar from "./components/Toolbar.vue";
import { ref, provide, computed, watchEffect, watch, onMounted, onUnmounted } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { Editor as TiptapEditor } from "@tiptap/vue-3";

// Tab interface
interface Tab {
  id: string;
  filePath: string | null;
  fileName: string;
  content: string;
  hasChanges: boolean;
}

// Tab management
const tabs = ref<Tab[]>([{
  id: "tab-1",
  filePath: null,
  fileName: "Nowy dokument",
  content: "<p></p>",
  hasChanges: false,
}]);
const activeTabId = ref("tab-1");
let tabCounter = 1;

const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) || tabs.value[0]);

const editorRef = ref<InstanceType<typeof Editor> | null>(null);
const editorInstance = ref<TiptapEditor | null>(null);
const currentFile = computed(() => activeTab.value?.filePath || null);
const hasChanges = computed(() => activeTab.value?.hasChanges || false);
const content = computed(() => activeTab.value?.content || "<p></p>");

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

// Tab management functions
const createNewTab = (filePath: string | null = null, fileContent: string = "<p></p>", fileName: string = "Nowy dokument"): string => {
  tabCounter++;
  const newTabId = `tab-${tabCounter}`;
  tabs.value.push({
    id: newTabId,
    filePath,
    fileName,
    content: fileContent,
    hasChanges: false,
  });
  return newTabId;
};

const switchToTab = (tabId: string) => {
  // Save current editor content to current tab before switching
  if (editorRef.value?.editor && activeTab.value) {
    const currentTabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    if (currentTabIndex !== -1) {
      tabs.value[currentTabIndex].content = editorRef.value.editor.getHTML();
    }
  }

  activeTabId.value = tabId;

  // Update editor with new tab's content
  if (editorRef.value?.editor) {
    editorRef.value.editor.commands.setContent(activeTab.value?.content || "<p></p>");
  }
};

const closeTab = async (tabId: string) => {
  const tabIndex = tabs.value.findIndex(t => t.id === tabId);
  if (tabIndex === -1) return;

  const tab = tabs.value[tabIndex];

  // Check for unsaved changes
  if (tab.hasChanges) {
    // In a real app, you'd show a confirmation dialog
    // For now, we'll just allow closing
  }

  // Remove the tab
  tabs.value.splice(tabIndex, 1);

  // If we closed the active tab, switch to another
  if (activeTabId.value === tabId) {
    if (tabs.value.length > 0) {
      // Switch to the previous tab, or the first one if we were at index 0
      const newIndex = Math.max(0, tabIndex - 1);
      activeTabId.value = tabs.value[newIndex].id;
      if (editorRef.value?.editor) {
        editorRef.value.editor.commands.setContent(tabs.value[newIndex].content);
      }
    } else {
      // Create a new empty tab if all tabs are closed
      const newTabId = createNewTab();
      activeTabId.value = newTabId;
      if (editorRef.value?.editor) {
        editorRef.value.editor.commands.setContent("<p></p>");
      }
    }
  }
};

// Find tab by file path
const findTabByFilePath = (filePath: string): Tab | undefined => {
  return tabs.value.find(t => t.filePath === filePath);
};

// Get directory from file path
const getDirectoryFromPath = (filePath: string): string => {
  const lastSlash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return lastSlash > 0 ? filePath.substring(0, lastSlash) : "";
};

// Open file in new tab (for internal links)
const openFileInNewTab = async (relativePath: string) => {
  try {
    // Get current file's directory as base
    const baseDir = currentFile.value ? getDirectoryFromPath(currentFile.value) : "";

    // Resolve the relative path
    let fullPath = relativePath;
    if (baseDir && !relativePath.match(/^[a-zA-Z]:/)) {
      // It's a relative path, combine with base directory
      fullPath = `${baseDir}/${relativePath}`.replace(/\\/g, "/");
      // Normalize path (handle ../ and ./)
      const parts = fullPath.split("/");
      const normalized: string[] = [];
      for (const part of parts) {
        if (part === "..") {
          normalized.pop();
        } else if (part !== "." && part !== "") {
          normalized.push(part);
        }
      }
      fullPath = normalized.join("/");
      // On Windows, restore the drive letter format
      if (fullPath.match(/^[a-zA-Z]\//)) {
        fullPath = fullPath.replace(/^([a-zA-Z])\//, "$1:/");
      }
    }

    // Check if file is already open
    const existingTab = findTabByFilePath(fullPath);
    if (existingTab) {
      switchToTab(existingTab.id);
      return;
    }

    // Read the file
    const fileContent = await readTextFile(fullPath);
    const htmlContent = markdownToHtml(fileContent);
    const fileName = fullPath.split(/[/\\]/).pop() || "Dokument";

    // Create new tab and switch to it
    const newTabId = createNewTab(fullPath, htmlContent, fileName);
    switchToTab(newTabId);
  } catch (error) {
    console.error("Błąd otwierania pliku:", error);
  }
};

// Handle link clicks from editor
const handleLinkClick = (href: string) => {
  // Check if it's a relative markdown link
  if (href.endsWith(".md") || href.endsWith(".markdown")) {
    // It's likely an internal markdown link
    openFileInNewTab(href);
  } else if (href.startsWith("http://") || href.startsWith("https://")) {
    // External link - open in browser (could use Tauri's shell.open)
    window.open(href, "_blank");
  } else {
    // Could be a relative link to any file
    openFileInNewTab(href);
  }
};

const windowTitle = computed(() => {
  const fileName = activeTab.value?.fileName || "Nowy dokument";
  const changeIndicator = activeTab.value?.hasChanges ? " *" : "";
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
    // Arrow entities
    .replace(/&rarr;/g, "→")
    .replace(/&larr;/g, "←")
    .replace(/&uarr;/g, "↑")
    .replace(/&darr;/g, "↓")
    .replace(/&harr;/g, "↔")
    // Other common entities
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&bull;/g, "•")
    .replace(/&hellip;/g, "…")
    .replace(/&copy;/g, "©")
    .replace(/&reg;/g, "®")
    .replace(/&trade;/g, "™")
    // Hex entities
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    // Decimal entities
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
};

const htmlToMarkdown = (html: string): string => {
  let md = html;

  // Normalize line endings (Windows \r\n to \n)
  md = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Extract mermaid and code blocks first to protect their content
  const protectedBlocks: string[] = [];

  // Mermaid blocks - must be FIRST before any other processing
  // Handle both double and single quotes, and various attribute orders
  // Match the complete div element including any inner content
  md = md.replace(/<div[^>]*data-type=["']mermaid["'][^>]*>[\s\S]*?<\/div>/gi, (match) => {
    // Extract data-code from the div
    const codeMatch = match.match(/data-code=["']([^"']*)["']/);
    if (codeMatch) {
      const code = decodeURIComponent(codeMatch[1]);
      const placeholder = `__PROTECTED_BLOCK_${protectedBlocks.length}__`;
      protectedBlocks.push(`\n\`\`\`mermaid\n${code}\n\`\`\`\n`);
      return placeholder;
    }
    return "";
  });

  // Code blocks - must be before inline code, decode HTML entities in code content
  // Handle various code block formats from TipTap
  md = md.replace(/<pre[^>]*>\s*<code[^>]*(?:class=["']language-(\w+)["'])?[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, lang, code) => {
    const decodedCode = decodeHtmlEntities(code);
    const langSpec = lang ? lang : "";
    const placeholder = `__PROTECTED_BLOCK_${protectedBlocks.length}__`;
    protectedBlocks.push(`\n\`\`\`${langSpec}\n${decodedCode}\n\`\`\`\n`);
    return placeholder;
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

  // Helper function to convert inline HTML to markdown
  const convertInlineToMarkdown = (html: string): string => {
    let result = html;
    // Convert inline code first (before links, as code might contain angle brackets)
    result = result.replace(/<code(?:\s[^>]*)?>([\s\S]*?)<\/code>/gi, (_, content) => {
      const decoded = decodeHtmlEntities(content);
      return `\`${decoded}\``;
    });
    // Convert links
    result = result.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
      const cleanText = text.replace(/<[^>]+>/g, "").trim();
      return `[${cleanText}](${href})`;
    });
    // Convert bold
    result = result.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
    result = result.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
    // Convert italic
    result = result.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
    result = result.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
    // Convert strikethrough
    result = result.replace(/<s[^>]*>(.*?)<\/s>/gi, "~~$1~~");
    // Remove remaining tags
    result = result.replace(/<[^>]+>/g, "");
    // Decode HTML entities
    result = decodeHtmlEntities(result);
    return result.trim();
  };

  // Helper function to parse nested lists recursively
  const parseList = (html: string, indent: number = 0, isOrdered: boolean = false, startIndex: number = 1): string => {
    let result = "";
    const indentStr = "  ".repeat(indent);

    // Find all direct children list items (not nested ones)
    // We need to carefully extract li elements at the current level
    let remaining = html;
    let itemIndex = startIndex;

    while (remaining.length > 0) {
      // Find the next <li> opening tag
      const liStartMatch = remaining.match(/^[\s\S]*?<li([^>]*)>/i);
      if (!liStartMatch) break;

      const liStartIndex = remaining.indexOf(liStartMatch[0]);
      remaining = remaining.slice(liStartIndex + liStartMatch[0].length);

      // Now we need to find the matching </li>, counting nested lists
      let depth = 1;
      let liContent = "";
      let pos = 0;

      while (depth > 0 && pos < remaining.length) {
        const nextLiOpen = remaining.indexOf("<li", pos);
        const nextLiClose = remaining.indexOf("</li>", pos);

        if (nextLiClose === -1) break;

        if (nextLiOpen !== -1 && nextLiOpen < nextLiClose) {
          // Found another opening <li> before the close
          liContent += remaining.slice(pos, nextLiOpen + 3);
          pos = nextLiOpen + 3;
          // Skip to after the > to properly count
          const endOfTag = remaining.indexOf(">", pos);
          if (endOfTag !== -1) {
            liContent += remaining.slice(pos, endOfTag + 1);
            pos = endOfTag + 1;
          }
          depth++;
        } else {
          // Found </li> first
          liContent += remaining.slice(pos, nextLiClose);
          pos = nextLiClose + 5; // length of "</li>"
          depth--;
        }
      }

      remaining = remaining.slice(pos);

      // Check if this is a task list item
      const isTaskItem = /data-type=["']taskItem["']/i.test(liStartMatch[1] || "");
      const isChecked = /data-checked=["']true["']/i.test(liStartMatch[1] || "");

      // Extract text content (before any nested list)
      let textContent = liContent;
      let nestedListHtml = "";

      // Check for nested <ul> or <ol>
      const nestedUlMatch = liContent.match(/<ul[^>]*>([\s\S]*)<\/ul>\s*$/i);
      const nestedOlMatch = liContent.match(/<ol[^>]*>([\s\S]*)<\/ol>\s*$/i);

      if (nestedUlMatch) {
        textContent = liContent.slice(0, liContent.lastIndexOf("<ul"));
        nestedListHtml = nestedUlMatch[0];
      } else if (nestedOlMatch) {
        textContent = liContent.slice(0, liContent.lastIndexOf("<ol"));
        nestedListHtml = nestedOlMatch[0];
      }

      // Clean up text content
      textContent = textContent
        .replace(/<label[^>]*>[\s\S]*?<\/label>/gi, "")
        .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1");
      const text = convertInlineToMarkdown(textContent);

      // Generate the list item marker
      let marker: string;
      if (isTaskItem) {
        marker = `- [${isChecked ? "x" : " "}]`;
      } else if (isOrdered) {
        marker = `${itemIndex}.`;
        itemIndex++;
      } else {
        marker = "-";
      }

      if (text.trim()) {
        result += `${indentStr}${marker} ${text}\n`;
      }

      // Process nested list if present
      if (nestedListHtml) {
        const isNestedOrdered = nestedListHtml.startsWith("<ol");
        const nestedContent = nestedListHtml.replace(/^<[uo]l[^>]*>([\s\S]*)<\/[uo]l>$/i, "$1");
        result += parseList(nestedContent, indent + 1, isNestedOrdered);
      }
    }

    return result;
  };

  // Task lists - convert using recursive parser
  md = md.replace(/<ul[^>]*data-type=["']taskList["'][^>]*>([\s\S]*?)<\/ul>/gi, (match) => {
    // Check if this is a nested task list (has parent list)
    // Only process top-level task lists here
    const content = match.replace(/^<ul[^>]*>([\s\S]*)<\/ul>$/i, "$1");
    return "\n" + parseList(content, 0, false);
  });

  // Regular lists - unordered (process from innermost to outermost)
  // First, let's find and replace all ul that don't contain nested ul/ol
  const processLists = (html: string): string => {
    let result = html;
    let changed = true;

    while (changed) {
      changed = false;

      // Process unordered lists that don't have task list type
      result = result.replace(/<ul(?![^>]*data-type=["']taskList["'])[^>]*>((?:(?!<ul|<ol)[\s\S])*?)<\/ul>/gi, (_match, content) => {
        changed = true;
        return "\n" + parseList(content, 0, false);
      });

      // Process ordered lists
      result = result.replace(/<ol[^>]*>((?:(?!<ul|<ol)[\s\S])*?)<\/ol>/gi, (_match, content) => {
        changed = true;
        return "\n" + parseList(content, 0, true);
      });
    }

    // Now handle any remaining lists with nested content
    result = result.replace(/<ul(?![^>]*data-type=["']taskList["'])[^>]*>([\s\S]*?)<\/ul>/gi, (match) => {
      const content = match.replace(/^<ul[^>]*>([\s\S]*)<\/ul>$/i, "$1");
      return "\n" + parseList(content, 0, false);
    });

    result = result.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, (match) => {
      const content = match.replace(/^<ol[^>]*>([\s\S]*)<\/ol>$/i, "$1");
      return "\n" + parseList(content, 0, true);
    });

    return result;
  };

  md = processLists(md);

  // Headers - preserve inline formatting
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, content) => `\n# ${convertInlineToMarkdown(content)}\n\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, content) => `\n## ${convertInlineToMarkdown(content)}\n\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, content) => `\n### ${convertInlineToMarkdown(content)}\n\n`);
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, content) => `\n#### ${convertInlineToMarkdown(content)}\n\n`);
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, content) => `\n##### ${convertInlineToMarkdown(content)}\n\n`);
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, content) => `\n###### ${convertInlineToMarkdown(content)}\n\n`);

  // Blockquote - preserve inline formatting
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content) => {
    const innerContent = content.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1");
    const text = convertInlineToMarkdown(innerContent);
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

  // Inline code - handle both with and without attributes
  // Use non-greedy match for content to handle HTML entities like &lt; &gt;
  md = md.replace(/<code(?:\s[^>]*)?>([\s\S]*?)<\/code>/gi, (_, content) => {
    // Decode HTML entities inside inline code
    const decoded = decodeHtmlEntities(content);
    return `\`${decoded}\``;
  });

  // Links - handle various attribute orders and quote styles
  md = md.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    // Remove any remaining HTML tags from link text
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    return `[${cleanText}](${href})`;
  });

  // Images - handle various attribute orders
  md = md.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, "![$2]($1)");
  md = md.replace(/<img\s+[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*\/?>/gi, "![$1]($2)");
  md = md.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*\/?>/gi, "![]($1)");

  // Paragraphs and line breaks
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<br[^>]*\/?>/gi, "  \n");

  // Remove remaining span tags but keep content (colors/fonts don't have Markdown equivalent)
  md = md.replace(/<span[^>]*>(.*?)<\/span>/gi, "$1");

  // Remove any remaining div tags
  md = md.replace(/<\/?div[^>]*>/gi, "\n");

  // Clean up all HTML entities using the helper function
  md = decodeHtmlEntities(md);

  // Restore protected blocks (mermaid and code blocks)
  protectedBlocks.forEach((block, index) => {
    md = md.replace(`__PROTECTED_BLOCK_${index}__`, block);
  });

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

  // Inline code - must be before links to handle code inside link text
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Links and images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img class="editor-image" src="$2" alt="$1" />');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="editor-link" href="$2">$1</a>');

  // Horizontal rule
  html = html.replace(/^---$/gim, "<hr />");

  // Blockquotes
  html = html.replace(/^&gt; (.*$)/gim, "<blockquote><p>$1</p></blockquote>");

  // Process lists (both unordered and ordered, with nesting support)
  // Parse list blocks and convert to proper nested HTML structure
  const parseMarkdownLists = (text: string): string => {
    const lines = text.split('\n');
    const result: string[] = [];
    let i = 0;

    // Helper to parse a list block starting at line index
    const parseListBlock = (startIndex: number): { html: string; endIndex: number } => {
      interface ListItem {
        indent: number;
        content: string;
        type: 'ul' | 'ol';
        number?: number;
      }

      const items: ListItem[] = [];
      let idx = startIndex;

      // Collect all consecutive list items
      while (idx < lines.length) {
        const line = lines[idx];
        // Match unordered list item: spaces + "- " + content
        const ulMatch = line.match(/^(\s*)- (.*)$/);
        // Match ordered list item: spaces + "number. " + content
        const olMatch = line.match(/^(\s*)(\d+)\. (.*)$/);

        if (ulMatch) {
          const indent = Math.floor(ulMatch[1].length / 2);
          const content = ulMatch[2].trim();
          // Skip empty list items
          if (content) {
            items.push({ indent, content, type: 'ul' });
          }
          idx++;
        } else if (olMatch) {
          const indent = Math.floor(olMatch[1].length / 2);
          const content = olMatch[3].trim();
          // Skip empty list items
          if (content) {
            items.push({ indent, content, type: 'ol', number: parseInt(olMatch[2]) });
          }
          idx++;
        } else {
          // Not a list item, stop
          break;
        }
      }

      if (items.length === 0) {
        return { html: '', endIndex: idx };
      }

      // Build nested list HTML from flat items
      const buildNestedList = (items: ListItem[], startIdx: number, baseIndent: number): { html: string; endIdx: number } => {
        if (startIdx >= items.length) {
          return { html: '', endIdx: startIdx };
        }

        const firstItem = items[startIdx];
        if (firstItem.indent < baseIndent) {
          return { html: '', endIdx: startIdx };
        }

        const listType = firstItem.type;
        let html = `<${listType}>`;
        let idx = startIdx;

        while (idx < items.length) {
          const item = items[idx];

          // If indent is less than base, we're done with this list level
          if (item.indent < baseIndent) {
            break;
          }

          // If indent matches base and type matches, add as sibling
          if (item.indent === baseIndent) {
            // Check if we're switching list types
            if (item.type !== listType) {
              // Close current list and start a new one
              break;
            }
            html += `<li><p>${item.content}</p>`;
            idx++;

            // Check for nested items
            if (idx < items.length && items[idx].indent > baseIndent) {
              const nested = buildNestedList(items, idx, items[idx].indent);
              html += nested.html;
              idx = nested.endIdx;
            }

            html += '</li>';
          } else if (item.indent > baseIndent) {
            // This is a nested item, should have been handled above
            // But if we get here, handle it anyway
            const nested = buildNestedList(items, idx, item.indent);
            html += nested.html;
            idx = nested.endIdx;
          }
        }

        html += `</${listType}>`;
        return { html, endIdx: idx };
      };

      // Process all items, handling type switches
      let fullHtml = '';
      let processedIdx = 0;
      while (processedIdx < items.length) {
        const result = buildNestedList(items, processedIdx, items[processedIdx].indent);
        fullHtml += result.html;
        processedIdx = result.endIdx;
      }

      return { html: fullHtml, endIndex: idx };
    };

    while (i < lines.length) {
      const line = lines[i];
      // Check if this is a list item (but not a task item which is handled separately)
      const isUnorderedList = /^\s*- /.test(line) && !/^\s*- \[[ x]\]/.test(line);
      const isOrderedList = /^\s*\d+\. /.test(line);

      if (isUnorderedList || isOrderedList) {
        const { html: listHtml, endIndex } = parseListBlock(i);
        result.push(listHtml);
        i = endIndex;
      } else {
        result.push(line);
        i++;
      }
    }

    return result.join('\n');
  };

  html = parseMarkdownLists(html);

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
      const filePath = selected as string;

      // Check if file is already open
      const existingTab = findTabByFilePath(filePath);
      if (existingTab) {
        switchToTab(existingTab.id);
        return;
      }

      const fileContent = await readTextFile(filePath);
      const htmlContent = markdownToHtml(fileContent);
      const fileName = filePath.split(/[/\\]/).pop() || "Dokument";

      // If current tab is empty and has no changes, replace it
      if (!activeTab.value?.filePath && !activeTab.value?.hasChanges && activeTab.value?.content === "<p></p>") {
        const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
        if (tabIndex !== -1) {
          tabs.value[tabIndex].filePath = filePath;
          tabs.value[tabIndex].fileName = fileName;
          tabs.value[tabIndex].content = htmlContent;
          tabs.value[tabIndex].hasChanges = false;
        }
      } else {
        // Create a new tab
        const newTabId = createNewTab(filePath, htmlContent, fileName);
        switchToTab(newTabId);
        return;
      }

      if (editorRef.value?.editor) {
        editorRef.value.editor.commands.setContent(htmlContent);
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

      // Update the active tab
      const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
      if (tabIndex !== -1) {
        tabs.value[tabIndex].filePath = filePath;
        tabs.value[tabIndex].fileName = filePath.split(/[/\\]/).pop() || "Dokument";
        tabs.value[tabIndex].hasChanges = false;
        tabs.value[tabIndex].content = html;
      }
    }
  } catch (error) {
    console.error("Błąd zapisywania pliku:", error);
  }
};

const saveFileAs = async () => {
  try {
    // Always show save dialog for "Save As"
    const filePath = await save({
      filters: [
        { name: "Markdown", extensions: ["md"] },
      ],
      defaultPath: currentFile.value?.split(/[/\\]/).pop() || "dokument.md",
    });

    if (filePath) {
      const html = editorRef.value?.editor?.getHTML() || "";
      const markdown = htmlToMarkdown(html);
      await writeTextFile(filePath, markdown);

      // Update the active tab
      const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
      if (tabIndex !== -1) {
        tabs.value[tabIndex].filePath = filePath;
        tabs.value[tabIndex].fileName = filePath.split(/[/\\]/).pop() || "Dokument";
        tabs.value[tabIndex].hasChanges = false;
        tabs.value[tabIndex].content = html;
      }
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
  // Update the active tab's content
  const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
  if (tabIndex !== -1) {
    tabs.value[tabIndex].content = newContent;
  }
};

const onChangesUpdate = (changed: boolean) => {
  // Update the active tab's hasChanges
  const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
  if (tabIndex !== -1) {
    tabs.value[tabIndex].hasChanges = changed;
  }
};

// Keyboard shortcuts
const handleKeyboard = (event: KeyboardEvent) => {
  // Check for Ctrl (Windows/Linux) or Cmd (Mac)
  const modifier = event.ctrlKey || event.metaKey;

  if (modifier) {
    switch (event.key.toLowerCase()) {
      case 's':
        event.preventDefault();
        if (event.shiftKey) {
          saveFileAs();
        } else {
          saveFile();
        }
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
      @save-file-as="saveFileAs"
      @export-pdf="exportPdf"
    />
    <!-- Tab Bar -->
    <div class="tab-bar" v-if="tabs.length > 1">
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: tab.id === activeTabId }"
        @click="switchToTab(tab.id)"
      >
        <span class="tab-name">{{ tab.fileName }}{{ tab.hasChanges ? ' *' : '' }}</span>
        <button class="tab-close" @click.stop="closeTab(tab.id)" title="Zamknij">&times;</button>
      </div>
    </div>
    <Editor
      ref="editorRef"
      :model-value="content"
      @update:model-value="onContentUpdate"
      @update:has-changes="onChangesUpdate"
      @link-click="handleLinkClick"
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

/* Tab Bar Styles */
.tab-bar {
  display: flex;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  overflow-x: auto;
  min-height: 36px;
  padding: 0 8px;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #e2e8f0;
  border-radius: 6px 6px 0 0;
  margin-top: 4px;
  cursor: pointer;
  user-select: none;
  max-width: 200px;
  transition: background 0.15s;
}

.tab:hover {
  background: #cbd5e1;
}

.tab.active {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-bottom: none;
  margin-bottom: -1px;
}

.tab-name {
  font-size: 13px;
  color: #475569;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tab.active .tab-name {
  color: #1e293b;
  font-weight: 500;
}

.tab-close {
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: #94a3b8;
  font-size: 16px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 3px;
  flex-shrink: 0;
  line-height: 1;
  padding: 0;
}

.tab-close:hover {
  background: #ef4444;
  color: white;
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
