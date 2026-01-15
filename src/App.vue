<script setup lang="ts">
import Editor from "./components/Editor.vue";
import Toolbar from "./components/Toolbar.vue";
import { ref, provide, computed, watchEffect, watch, onMounted, onUnmounted, nextTick } from "vue";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Editor as TiptapEditor } from "@tiptap/vue-3";

// Tab interface
interface Tab {
  id: string;
  filePath: string | null;
  fileName: string;
  content: string;
  hasChanges: boolean;
  scrollTop: number;
}

// Tab management
const tabs = ref<Tab[]>([{
  id: "tab-1",
  filePath: null,
  fileName: "Nowy dokument",
  content: "<p></p>",
  hasChanges: false,
  scrollTop: 0,
}]);
const activeTabId = ref("tab-1");
let tabCounter = 1;

const activeTab = computed(() => tabs.value.find(t => t.id === activeTabId.value) || tabs.value[0]);

const editorRef = ref<InstanceType<typeof Editor> | null>(null);
const editorInstance = ref<TiptapEditor | null>(null);
const currentFile = computed(() => activeTab.value?.filePath || null);
const hasChanges = computed(() => activeTab.value?.hasChanges || false);
const content = computed(() => activeTab.value?.content || "<p></p>");

// Flag to ignore hasChanges updates when loading content programmatically
const isLoadingContent = ref(false);

// Code view toggle
const codeView = ref(false);
const codeContent = ref("");
const codeEditorRef = ref<HTMLTextAreaElement | null>(null);
const savedScrollRatio = ref(0); // Save scroll ratio when switching views
const savedCursorText = ref(""); // Save text at cursor for syncing between views

// Loading state for file operations
const isLoadingFile = ref(false);

const toggleCodeView = async () => {
  if (!codeView.value) {
    // Switching to code view - convert HTML to Markdown
    const html = activeTab.value?.content || "<p></p>";
    codeContent.value = htmlToMarkdown(html);

    // Get the text at cursor position from TipTap for syncing
    savedCursorText.value = "";
    if (editorRef.value?.editor) {
      const editor = editorRef.value.editor;
      const { from } = editor.state.selection;

      // Get the node at cursor position
      const $pos = editor.state.doc.resolve(from);

      // Try to find the parent block (heading, paragraph, etc.)
      for (let depth = $pos.depth; depth >= 0; depth--) {
        const node = $pos.node(depth);
        if (node.type.name === 'heading') {
          // For headings, save the prefix (### ) + text
          const level = node.attrs.level || 1;
          const prefix = '#'.repeat(level) + ' ';
          const text = node.textContent;
          savedCursorText.value = prefix + text;
          break;
        } else if (node.type.name === 'paragraph' && node.textContent.trim()) {
          // For paragraphs, save just the text (first 50 chars to avoid false matches)
          savedCursorText.value = node.textContent.trim().slice(0, 50);
          break;
        } else if (node.type.name === 'codeBlock') {
          // For code blocks, save a portion of the code
          savedCursorText.value = '```';
          break;
        } else if (node.type.name === 'listItem' && node.textContent.trim()) {
          // For list items, save the text
          savedCursorText.value = node.textContent.trim().slice(0, 50);
          break;
        }
      }
    }

    // Save current scroll ratio as fallback
    const editorContainer = document.querySelector('.editor-container');
    if (editorContainer) {
      const maxScroll = editorContainer.scrollHeight - editorContainer.clientHeight;
      savedScrollRatio.value = maxScroll > 0 ? editorContainer.scrollTop / maxScroll : 0;
    }

    codeView.value = true;

    // After switching, find and set cursor position in code editor
    await nextTick();
    await nextTick();
    if (codeEditorRef.value) {
      let cursorSet = false;

      if (savedCursorText.value) {
        // Find the text in the Markdown content
        const searchText = savedCursorText.value;
        const pos = codeContent.value.indexOf(searchText);

        if (pos !== -1) {
          // Set cursor at the found position
          codeEditorRef.value.focus();
          codeEditorRef.value.setSelectionRange(pos, pos);

          // Scroll to make cursor visible
          // Calculate line number for scrolling
          const textBefore = codeContent.value.slice(0, pos);
          const lineNumber = textBefore.split('\n').length;
          const lineHeight = 22.4; // Approximate line height (14px font * 1.6 line-height)
          const scrollTarget = Math.max(0, (lineNumber - 5) * lineHeight);
          codeEditorRef.value.scrollTop = scrollTarget;
          cursorSet = true;
        }
      }

      if (!cursorSet) {
        // Fallback to scroll ratio
        const codeMaxScroll = codeEditorRef.value.scrollHeight - codeEditorRef.value.clientHeight;
        const targetScroll = Math.round(savedScrollRatio.value * codeMaxScroll);
        codeEditorRef.value.scrollTop = targetScroll;
        codeEditorRef.value.focus();
      }
    }
  } else {
    // Switching back to visual view - convert Markdown to HTML
    // Save the text at cursor position in code editor for syncing
    savedCursorText.value = "";
    if (codeEditorRef.value) {
      const cursorPos = codeEditorRef.value.selectionStart;
      const content = codeContent.value;

      // Find the line at cursor position
      const textBefore = content.slice(0, cursorPos);
      const lineStart = textBefore.lastIndexOf('\n') + 1;
      const lineEnd = content.indexOf('\n', cursorPos);
      const currentLine = content.slice(lineStart, lineEnd === -1 ? content.length : lineEnd);

      // Check if it's a heading line
      const headingMatch = currentLine.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        savedCursorText.value = headingMatch[2].trim(); // Save just the heading text
      } else if (currentLine.trim()) {
        // Save first 50 chars of the line for matching
        savedCursorText.value = currentLine.trim().slice(0, 50);
      }

      // Also save scroll ratio as fallback
      const codeMaxScroll = codeEditorRef.value.scrollHeight - codeEditorRef.value.clientHeight;
      savedScrollRatio.value = codeMaxScroll > 0 ? codeEditorRef.value.scrollTop / codeMaxScroll : 0;
    }

    const html = markdownToHtml(codeContent.value);
    if (activeTab.value) {
      isLoadingContent.value = true;
      activeTab.value.content = html;
      activeTab.value.hasChanges = true;
    }
    codeView.value = false;

    // Find and scroll to the matching content in visual editor
    await nextTick();
    await nextTick();
    await nextTick();

    let scrollDone = false;
    if (savedCursorText.value && editorRef.value?.editor) {
      const editor = editorRef.value.editor;
      const searchText = savedCursorText.value;

      // Search through the document for matching text
      let foundPos = -1;
      editor.state.doc.descendants((node, pos) => {
        if (foundPos !== -1) return false; // Already found

        if (node.isBlock && node.textContent) {
          const nodeText = node.textContent.trim();
          if (nodeText.includes(searchText) || searchText.includes(nodeText.slice(0, 30))) {
            foundPos = pos;
            return false;
          }
        }
        return true;
      });

      if (foundPos !== -1) {
        // Set cursor and scroll to position
        editor.commands.setTextSelection(foundPos + 1);

        // Use scrollIntoView after setting selection
        await nextTick();
        const editorContainer = document.querySelector('.editor-container');
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0 && editorContainer) {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const containerRect = editorContainer.getBoundingClientRect();

          if (rect.top < containerRect.top || rect.bottom > containerRect.bottom) {
            const scrollOffset = rect.top - containerRect.top + editorContainer.scrollTop - 100;
            editorContainer.scrollTop = Math.max(0, scrollOffset);
          }
        }
        scrollDone = true;
      }
    }

    if (!scrollDone) {
      // Fallback to scroll ratio
      const editorContainer = document.querySelector('.editor-container');
      if (editorContainer) {
        const maxScroll = editorContainer.scrollHeight - editorContainer.clientHeight;
        const targetScroll = Math.round(savedScrollRatio.value * maxScroll);
        editorContainer.scrollTop = targetScroll;
      }
    }

    isLoadingContent.value = false;
  }
};

const onCodeContentUpdate = (value: string) => {
  codeContent.value = value;
  if (activeTab.value) {
    activeTab.value.hasChanges = true;
  }
};

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
    scrollTop: 0,
  });
  return newTabId;
};

const switchToTab = async (tabId: string, preserveHasChanges: boolean = true) => {
  // Save current editor content and scroll position to current tab before switching
  if (editorRef.value?.editor && activeTab.value) {
    const currentTabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
    if (currentTabIndex !== -1) {
      tabs.value[currentTabIndex].content = editorRef.value.editor.getHTML();
      // Save scroll position
      const editorContainer = document.querySelector('.editor-container');
      if (editorContainer) {
        tabs.value[currentTabIndex].scrollTop = editorContainer.scrollTop;
      }
    }
  }

  // Get the target tab's hasChanges state and scroll position before switching
  const targetTab = tabs.value.find(t => t.id === tabId);
  const targetHasChanges = targetTab?.hasChanges || false;
  const targetScrollTop = targetTab?.scrollTop || 0;

  activeTabId.value = tabId;

  // Update editor with new tab's content
  if (editorRef.value?.editor) {
    isLoadingContent.value = true;
    editorRef.value.editor.commands.setContent(activeTab.value?.content || "<p></p>");

    // Wait for the next tick and reset hasChanges if needed
    await nextTick();
    isLoadingContent.value = false;

    // Preserve the tab's original hasChanges state after content load
    if (preserveHasChanges) {
      const tabIndex = tabs.value.findIndex(t => t.id === tabId);
      if (tabIndex !== -1) {
        tabs.value[tabIndex].hasChanges = targetHasChanges;
      }
    }

    // Restore scroll position after content is loaded
    await nextTick();
    const editorContainer = document.querySelector('.editor-container');
    if (editorContainer) {
      editorContainer.scrollTop = targetScrollTop;
    }
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
        isLoadingContent.value = true;
        editorRef.value.editor.commands.setContent(tabs.value[newIndex].content);
        await nextTick();
        isLoadingContent.value = false;
      }
    } else {
      // Create a new empty tab if all tabs are closed
      const newTabId = createNewTab();
      activeTabId.value = newTabId;
      if (editorRef.value?.editor) {
        isLoadingContent.value = true;
        editorRef.value.editor.commands.setContent("<p></p>");
        await nextTick();
        isLoadingContent.value = false;
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
    // Save current scroll position before navigating
    if (activeTab.value) {
      const editorContainer = document.querySelector('.editor-container');
      if (editorContainer) {
        const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
        if (tabIndex !== -1) {
          tabs.value[tabIndex].scrollTop = editorContainer.scrollTop;
        }
      }
    }

    // Show loading indicator
    isLoadingFile.value = true;

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
      await switchToTab(existingTab.id);
      isLoadingFile.value = false;
      return;
    }

    // Read the file
    const fileContent = await readTextFile(fullPath);
    const htmlContent = markdownToHtml(fileContent);
    const fileName = fullPath.split(/[/\\]/).pop() || "Dokument";

    // Create new tab and switch to it
    const newTabId = createNewTab(fullPath, htmlContent, fileName);
    await switchToTab(newTabId);
    isLoadingFile.value = false;
  } catch (error) {
    console.error("Błąd otwierania pliku:", error);
    isLoadingFile.value = false;
  }
};

// External link confirmation state
const showExternalLinkDialog = ref(false);
const pendingExternalUrl = ref('');

const confirmExternalLink = async () => {
  if (pendingExternalUrl.value) {
    try {
      await openExternal(pendingExternalUrl.value);
    } catch (error) {
      console.error("Błąd otwierania linku:", error);
    }
  }
  showExternalLinkDialog.value = false;
  pendingExternalUrl.value = '';
};

const cancelExternalLink = () => {
  showExternalLinkDialog.value = false;
  pendingExternalUrl.value = '';
};

// Handle link clicks from editor
const handleLinkClick = (href: string) => {
  // Check if it's an anchor link (internal navigation)
  if (href.startsWith("#")) {
    // Find the element with matching ID and scroll only the editor container
    const targetId = href.slice(1); // Remove the # prefix
    const editorContainer = document.querySelector('.editor-container');
    const targetElement = editorContainer?.querySelector(`[id="${targetId}"]`) as HTMLElement | null;
    if (targetElement && editorContainer) {
      // Calculate the scroll position relative to the editor container
      const containerRect = editorContainer.getBoundingClientRect();
      const elementRect = targetElement.getBoundingClientRect();
      const scrollOffset = elementRect.top - containerRect.top + editorContainer.scrollTop - 20; // 20px padding from top

      // Scroll only the editor container, not the whole page
      editorContainer.scrollTo({
        top: scrollOffset,
        behavior: 'smooth'
      });
    }
    return;
  }

  // Check if it's a relative markdown link
  if (href.endsWith(".md") || href.endsWith(".markdown")) {
    // It's likely an internal markdown link
    openFileInNewTab(href);
  } else if (href.startsWith("http://") || href.startsWith("https://") || href.includes(".") && !href.includes("/")) {
    // External link - show confirmation dialog
    pendingExternalUrl.value = href.startsWith("http") ? href : `https://${href}`;
    showExternalLinkDialog.value = true;
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
    // IMPORTANT: Match double-quoted values first (our output format), then single-quoted
    // We must not use [^"']* as it stops at EITHER quote, causing truncation
    // when content contains single quotes (like 'message' in mermaid)
    let codeMatch = match.match(/data-code="([^"]*)"/);
    if (!codeMatch) {
      codeMatch = match.match(/data-code='([^']*)'/);
    }
    if (codeMatch) {
      let code = decodeURIComponent(codeMatch[1]);
      // Convert placeholder back to <br> tags for proper mermaid syntax in saved file
      code = code.replace(/__BR__/g, '<br/>');
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

    // Protect inline code content FIRST with placeholders
    // This prevents <T>, <TId>, etc. from being stripped as HTML tags later
    const inlineCodeBlocks: string[] = [];
    result = result.replace(/<code(?:\s[^>]*)?>([\s\S]*?)<\/code>/gi, (_, content) => {
      const decoded = decodeHtmlEntities(content);
      const placeholder = `__INLINE_CODE_${inlineCodeBlocks.length}__`;
      inlineCodeBlocks.push(`\`${decoded}\``);
      return placeholder;
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

    // Restore inline code blocks (with their original content including <T>, etc.)
    inlineCodeBlocks.forEach((code, index) => {
      result = result.replace(`__INLINE_CODE_${index}__`, code);
    });

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
  // Replace <br> tags with placeholder to prevent HTML processing corruption
  html = html.replace(/```mermaid\n([\s\S]*?)```/gi, (_, code) => {
    const placeholder = `__MERMAID_BLOCK_${codeBlocks.length}__`;
    // Convert <br> and <br/> to safe placeholder that won't be processed as HTML
    const safeCode = code.trim().replace(/<br\s*\/?>/gi, '__BR__');
    codeBlocks.push(`<div data-type="mermaid" data-code="${encodeURIComponent(safeCode)}"></div>`);
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

  // Helper: Generate slug ID from header text (GitHub-style)
  const generateSlug = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/\s+/g, '-')     // Replace spaces with hyphens
      .replace(/-+/g, '-')      // Replace multiple hyphens with single
      .trim();
  };

  // Headers with IDs for anchor navigation
  html = html.replace(/^###### (.*$)/gim, (_, content) => `<h6 id="${generateSlug(content)}">${content}</h6>`);
  html = html.replace(/^##### (.*$)/gim, (_, content) => `<h5 id="${generateSlug(content)}">${content}</h5>`);
  html = html.replace(/^#### (.*$)/gim, (_, content) => `<h4 id="${generateSlug(content)}">${content}</h4>`);
  html = html.replace(/^### (.*$)/gim, (_, content) => `<h3 id="${generateSlug(content)}">${content}</h3>`);
  html = html.replace(/^## (.*$)/gim, (_, content) => `<h2 id="${generateSlug(content)}">${content}</h2>`);
  html = html.replace(/^# (.*$)/gim, (_, content) => `<h1 id="${generateSlug(content)}">${content}</h1>`);

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
        await switchToTab(existingTab.id);
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

          if (editorRef.value?.editor) {
            isLoadingContent.value = true;
            editorRef.value.editor.commands.setContent(htmlContent);
            await nextTick();
            isLoadingContent.value = false;
            // Ensure hasChanges stays false
            tabs.value[tabIndex].hasChanges = false;
          }
        }
      } else {
        // Create a new tab
        const newTabId = createNewTab(filePath, htmlContent, fileName);
        await switchToTab(newTabId);
      }
    }
  } catch (error) {
    console.error("Błąd otwierania pliku:", error);
  }
};

// Open file directly from path (for file association / CLI args)
const openFileFromPath = async (filePath: string) => {
  try {
    // Check if file is already open
    const existingTab = findTabByFilePath(filePath);
    if (existingTab) {
      await switchToTab(existingTab.id);
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

        if (editorRef.value?.editor) {
          isLoadingContent.value = true;
          editorRef.value.editor.commands.setContent(htmlContent);
          await nextTick();
          isLoadingContent.value = false;
          tabs.value[tabIndex].hasChanges = false;
        }
      }
    } else {
      // Create a new tab
      const newTabId = createNewTab(filePath, htmlContent, fileName);
      await switchToTab(newTabId);
    }
  } catch (error) {
    console.error("Błąd otwierania pliku z argumentów:", error);
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

const exportPdf = () => {
  // Add a class to body during print for better control
  document.body.classList.add('printing');

  // Use window.print() - Tauri webview print options don't fully work on Windows
  // Note: Headers/footers are controlled by browser/OS settings
  // Users can disable them in the print dialog settings
  window.print();

  document.body.classList.remove('printing');
};

const onContentUpdate = (newContent: string) => {
  // Update the active tab's content
  const tabIndex = tabs.value.findIndex(t => t.id === activeTabId.value);
  if (tabIndex !== -1) {
    tabs.value[tabIndex].content = newContent;
  }
};

const onChangesUpdate = (changed: boolean) => {
  // Ignore hasChanges updates when loading content programmatically
  if (isLoadingContent.value) return;

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

// Store unlisten function for cleanup
let unlistenOpenFile: UnlistenFn | null = null;

// Auto-update state
const showUpdateDialog = ref(false);
const updateInfo = ref<{ version: string; notes: string } | null>(null);
const updateProgress = ref(0);
const isUpdating = ref(false);
const updateError = ref<string | null>(null);

// Check for updates
const checkForUpdates = async () => {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (update) {
      updateInfo.value = {
        version: update.version,
        notes: update.body || "",
      };
      showUpdateDialog.value = true;
    }
  } catch (error) {
    // Silently fail if update check fails (might not have endpoints configured)
    console.log("Sprawdzanie aktualizacji pominięte:", error);
  }
};

// Download and install update
const downloadAndInstallUpdate = async () => {
  try {
    isUpdating.value = true;
    updateError.value = null;
    updateProgress.value = 0;

    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (update) {
      // Download with progress - use type from plugin
      await update.downloadAndInstall((progress) => {
        if (progress.event === "Started") {
          updateProgress.value = 0;
        } else if (progress.event === "Progress") {
          updateProgress.value = Math.min(99, updateProgress.value + 1);
        } else if (progress.event === "Finished") {
          updateProgress.value = 100;
        }
      });

      // Restart the app after update
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    }
  } catch (error) {
    updateError.value = error instanceof Error ? error.message : "Błąd podczas aktualizacji";
    isUpdating.value = false;
  }
};

const closeUpdateDialog = () => {
  if (!isUpdating.value) {
    showUpdateDialog.value = false;
    updateInfo.value = null;
    updateError.value = null;
  }
};


onMounted(async () => {
  window.addEventListener('keydown', handleKeyboard);

  // Check for file path from CLI arguments (file association on first launch)
  try {
    const filePath = await invoke<string | null>('get_open_file_path');
    if (filePath) {
      // Wait for editor to be ready
      await nextTick();
      setTimeout(() => openFileFromPath(filePath), 100);
    }
  } catch (error) {
    console.error("Błąd pobierania ścieżki pliku:", error);
  }

  // Listen for open-file events (when app is already running)
  try {
    unlistenOpenFile = await listen<string>('open-file', (event) => {
      openFileFromPath(event.payload);
    });
  } catch (error) {
    console.error("Błąd nasłuchiwania zdarzeń:", error);
  }

  // Check for updates after app is ready (with delay to not slow down startup)
  setTimeout(() => checkForUpdates(), 3000);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyboard);
  if (unlistenOpenFile) {
    unlistenOpenFile();
  }
});
</script>

<template>
  <div class="app">
    <Toolbar
      :code-view="codeView"
      @open-file="openFile"
      @save-file="saveFile"
      @save-file-as="saveFileAs"
      @export-pdf="exportPdf"
      @toggle-code-view="toggleCodeView"
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
    <!-- Visual Editor -->
    <Editor
      v-if="!codeView"
      ref="editorRef"
      :model-value="content"
      @update:model-value="onContentUpdate"
      @update:has-changes="onChangesUpdate"
      @link-click="handleLinkClick"
    />

    <!-- Code View (Raw Markdown) -->
    <div v-else class="code-editor-container">
      <textarea
        ref="codeEditorRef"
        class="code-editor"
        :value="codeContent"
        @input="(e) => onCodeContentUpdate((e.target as HTMLTextAreaElement).value)"
        spellcheck="false"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
      ></textarea>
    </div>

    <!-- Loading Overlay -->
    <div v-if="isLoadingFile" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>Otwieranie pliku...</p>
    </div>

    <!-- External Link Confirmation Dialog -->
    <div v-if="showExternalLinkDialog" class="dialog-overlay" @click.self="cancelExternalLink">
      <div class="dialog">
        <div class="dialog-header">
          <h3>Otwórz link zewnętrzny</h3>
        </div>
        <div class="dialog-content">
          <p>Czy na pewno chcesz przejść do:</p>
          <p class="dialog-url">{{ pendingExternalUrl }}</p>
        </div>
        <div class="dialog-actions">
          <button @click="cancelExternalLink" class="btn-cancel">Anuluj</button>
          <button @click="confirmExternalLink" class="btn-confirm">Otwórz</button>
        </div>
      </div>
    </div>

    <!-- Update Available Dialog -->
    <div v-if="showUpdateDialog" class="dialog-overlay" @click.self="closeUpdateDialog">
      <div class="dialog">
        <div class="dialog-header">
          <h3>Dostępna aktualizacja</h3>
        </div>
        <div class="dialog-content">
          <p v-if="updateInfo">Dostępna jest nowa wersja: <strong>{{ updateInfo.version }}</strong></p>
          <div v-if="updateInfo?.notes" class="update-notes">
            <p>{{ updateInfo.notes }}</p>
          </div>
          <div v-if="isUpdating" class="update-progress">
            <p>Pobieranie aktualizacji...</p>
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: `${updateProgress}%` }"></div>
            </div>
          </div>
          <p v-if="updateError" class="update-error">{{ updateError }}</p>
        </div>
        <div class="dialog-actions">
          <button @click="closeUpdateDialog" class="btn-cancel" :disabled="isUpdating">Później</button>
          <button @click="downloadAndInstallUpdate" class="btn-confirm" :disabled="isUpdating">
            {{ isUpdating ? 'Aktualizowanie...' : 'Aktualizuj teraz' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #ffffff;
}

/* Code Editor Styles */
.code-editor-container {
  flex: 1;
  overflow: auto;
  background: #1e293b;
  padding: 20px;
}

.code-editor {
  width: 100%;
  height: 100%;
  min-height: calc(100vh - 180px);
  background: #0f172a;
  color: #e2e8f0;
  border: none;
  border-radius: 8px;
  padding: 24px;
  font-family: "Fira Code", "Consolas", "Monaco", monospace;
  font-size: 14px;
  line-height: 1.6;
  resize: none;
  outline: none;
  tab-size: 2;
}

.code-editor:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
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

/* External Link Dialog */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.dialog {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 450px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.dialog-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  color: #1e293b;
}

.dialog-content {
  padding: 20px;
}

.dialog-content p {
  margin: 0 0 8px 0;
  color: #475569;
}

.dialog-url {
  font-family: "Fira Code", "Consolas", monospace;
  font-size: 13px;
  background: #f1f5f9;
  padding: 12px;
  border-radius: 6px;
  word-break: break-all;
  color: #2563eb;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}

.dialog-actions .btn-cancel {
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 6px;
  cursor: pointer;
  background: #e2e8f0;
  color: #475569;
  border: none;
  transition: all 0.2s;
}

.dialog-actions .btn-cancel:hover {
  background: #cbd5e1;
}

.dialog-actions .btn-confirm {
  padding: 8px 16px;
  font-size: 14px;
  border-radius: 6px;
  cursor: pointer;
  background: #2563eb;
  color: white;
  border: none;
  transition: all 0.2s;
}

.dialog-actions .btn-confirm:hover {
  background: #1d4ed8;
}
.dialog-actions .btn-confirm:disabled,
.dialog-actions .btn-cancel:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Update Dialog Styles */
.update-notes {
  background: #f8fafc;
  padding: 12px;
  border-radius: 6px;
  margin-top: 12px;
  font-size: 13px;
  color: #475569;
  max-height: 150px;
  overflow-y: auto;
}

.update-progress {
  margin-top: 16px;
}

.progress-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
  margin-top: 8px;
}

.progress-fill {
  height: 100%;
  background: #2563eb;
  transition: width 0.3s ease;
}

.update-error {
  color: #dc2626;
  margin-top: 12px;
  font-size: 13px;
}

/* Loading Overlay */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  gap: 16px;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #e2e8f0;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-overlay p {
  color: #475569;
  font-size: 14px;
  margin: 0;
}
</style>
