export function markdownToHtml(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const codeLines = [];
  let inList = false;
  let inCode = false;

  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };

  const flushCode = () => {
    if (!inCode) return;
    out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    codeLines.length = 0;
    inCode = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (line.startsWith("```")) {
      closeList();
      if (inCode) flushCode();
      else inCode = true;
      continue;
    }
    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }
    if (line.trim() === "") {
      closeList();
      continue;
    }
    if (line.startsWith("# ")) {
      closeList();
      out.push(`<h1>${inlineMarkdown(line.slice(2).trim())}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      closeList();
      out.push(`<h2>${inlineMarkdown(line.slice(3).trim())}</h2>`);
      continue;
    }
    if (line.startsWith("> ")) {
      closeList();
      out.push(`<blockquote>${inlineMarkdown(line.slice(2).trim())}</blockquote>`);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineMarkdown(line.slice(2).trim())}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inlineMarkdown(line.trim())}</p>`);
  }

  closeList();
  flushCode();
  return out.join("\n");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function inlineMarkdown(text) {
  const escaped = escapeHtml(text);
  const codeTokens = [];
  const withCodeTokens = escaped.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE_${codeTokens.length}@@`;
    codeTokens.push(`<code>${code}</code>`);
    return token;
  });
  const withBold = withCodeTokens.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return withBold.replace(/@@CODE_(\d+)@@/g, (_, index) => codeTokens[Number(index)] || "");
}
