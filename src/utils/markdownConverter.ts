/**
 * Markdown Converter Utilities
 * Functions to convert between HTML and Markdown formats
 */

// Helper: Decode HTML entities
export const decodeHtmlEntities = (text: string): string => {
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

// Helper: Escape HTML entities (but not inside code blocks)
export const escapeHtml = (text: string): string => {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
};

// Helper function to convert inline HTML to markdown
export const convertInlineToMarkdown = (html: string): string => {
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
export const parseList = (
  html: string,
  indent: number = 0,
  isOrdered: boolean = false,
  startIndex: number = 1
): string => {
  let result = "";
  const indentStr = "  ".repeat(indent);

  // Find all direct children list items (not nested ones)
  let remaining = html;
  let itemIndex = startIndex;

  while (remaining.length > 0) {
    // Find the next <li> opening tag
    const liStartMatch = remaining.match(/^[\s\S]*?<li([^>]*)>/i);
    if (!liStartMatch) break;

    const liStartIndex = remaining.indexOf(liStartMatch[0]);
    remaining = remaining.slice(liStartIndex + liStartMatch[0].length);

    // Find the matching </li>, counting nested lists
    let depth = 1;
    let liContent = "";
    let pos = 0;

    while (depth > 0 && pos < remaining.length) {
      const nextLiOpen = remaining.indexOf("<li", pos);
      const nextLiClose = remaining.indexOf("</li>", pos);

      if (nextLiClose === -1) break;

      if (nextLiOpen !== -1 && nextLiOpen < nextLiClose) {
        liContent += remaining.slice(pos, nextLiOpen + 3);
        pos = nextLiOpen + 3;
        const endOfTag = remaining.indexOf(">", pos);
        if (endOfTag !== -1) {
          liContent += remaining.slice(pos, endOfTag + 1);
          pos = endOfTag + 1;
        }
        depth++;
      } else {
        liContent += remaining.slice(pos, nextLiClose);
        pos = nextLiClose + 5;
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

/**
 * Convert HTML to Markdown
 */
export const htmlToMarkdown = (html: string): string => {
  let md = html;

  // Normalize line endings (Windows \r\n to \n)
  md = md.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Extract mermaid and code blocks first to protect their content
  const protectedBlocks: string[] = [];

  // Mermaid blocks - must be FIRST before any other processing
  md = md.replace(/<div[^>]*data-type=["']mermaid["'][^>]*>[\s\S]*?<\/div>/gi, (match) => {
    const codeMatch = match.match(/data-code=["']([^"']*)["']/);
    if (codeMatch) {
      const code = decodeURIComponent(codeMatch[1]);
      const placeholder = `__PROTECTED_BLOCK_${protectedBlocks.length}__`;
      protectedBlocks.push(`\n\`\`\`mermaid\n${code}\n\`\`\`\n`);
      return placeholder;
    }
    return "";
  });

  // Code blocks - must be before inline code
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

  // Task lists - convert using recursive parser
  md = md.replace(/<ul[^>]*data-type=["']taskList["'][^>]*>([\s\S]*?)<\/ul>/gi, (match) => {
    const content = match.replace(/^<ul[^>]*>([\s\S]*)<\/ul>$/i, "$1");
    return "\n" + parseList(content, 0, false);
  });

  // Regular lists - process from innermost to outermost
  const processLists = (htmlContent: string): string => {
    let result = htmlContent;
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

    // Handle any remaining lists with nested content
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

  // Remove unsupported HTML tags
  md = md.replace(/<sup[^>]*>(.*?)<\/sup>/gi, "$1");
  md = md.replace(/<sub[^>]*>(.*?)<\/sub>/gi, "$1");
  md = md.replace(/<u[^>]*>(.*?)<\/u>/gi, "$1");
  md = md.replace(/<mark[^>]*>(.*?)<\/mark>/gi, "$1");

  // Inline code
  md = md.replace(/<code(?:\s[^>]*)?>([\s\S]*?)<\/code>/gi, (_, content) => {
    const decoded = decodeHtmlEntities(content);
    return `\`${decoded}\``;
  });

  // Links
  md = md.replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const cleanText = text.replace(/<[^>]+>/g, "").trim();
    return `[${cleanText}](${href})`;
  });

  // Images
  md = md.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*alt=["']([^"']*)["'][^>]*\/?>/gi, "![$2]($1)");
  md = md.replace(/<img\s+[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']*)["'][^>]*\/?>/gi, "![$1]($2)");
  md = md.replace(/<img\s+[^>]*src=["']([^"']*)["'][^>]*\/?>/gi, "![]($1)");

  // Paragraphs and line breaks
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
  md = md.replace(/<br[^>]*\/?>/gi, "  \n");

  // Remove remaining span tags but keep content
  md = md.replace(/<span[^>]*>(.*?)<\/span>/gi, "$1");

  // Remove any remaining div tags
  md = md.replace(/<\/?div[^>]*>/gi, "\n");

  // Clean up all HTML entities
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

/**
 * Convert Markdown to HTML
 */
export const markdownToHtml = (md: string): string => {
  let html = md;

  // Normalize line endings first
  html = html.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Extract and protect code blocks FIRST (before escaping HTML)
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

  // Unordered lists
  html = html.replace(/^(\s*)- (.*)$/gim, (_, indent, content) => {
    const level = Math.floor(indent.length / 2);
    return `<li data-indent="${level}"><p>${content}</p></li>`;
  });

  // Wrap consecutive list items in ul, excluding task items
  html = html.replace(/(<li data-indent="\d+"[^>]*>[\s\S]*?<\/li>\n?)+/g, (match) => {
    if (match.includes('data-type="taskItem"')) {
      return match;
    }
    const cleaned = match.replace(/ data-indent="\d+"/g, "");
    return `<ul>${cleaned}</ul>`;
  });

  // Ordered lists
  html = html.replace(/^(\s*)\d+\. (.*)$/gim, (_, _indent, content) => {
    return `<li><p>${content}</p></li>`;
  });

  // Wrap consecutive ordered list items
  html = html.replace(/(<li><p>(?!.*data-type|.*data-indent)[\s\S]*?<\/p><\/li>\n?)+/g, (match) => {
    return `<ol>${match}</ol>`;
  });

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
