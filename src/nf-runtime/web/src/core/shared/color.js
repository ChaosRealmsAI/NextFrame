function normalizeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

export function makeLinearGradient(colors, fallback = ["#ffffff"]) {
  const palette = normalizeArray(colors, fallback).filter(Boolean);
  return `linear-gradient(135deg, ${(palette.length > 0 ? palette : fallback).join(", ")})`;
}

function toFileHref(path) {
  const value = String(path ?? "").trim();
  if (!value) {
    return "";
  }

  if (/^(data:|blob:|https?:|file:|nfdata:)/i.test(value)) {
    return value;
  }

  const normalized = value.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${encodeURI(normalized)}`;
  }
  if (normalized.startsWith("/")) {
    return `file://${encodeURI(normalized)}`;
  }
  return "";
}

function timelineBaseHref() {
  if (typeof window === "undefined") {
    return "";
  }

  const explicitBase = String(window.__NEXTFRAME_TIMELINE_BASE_HREF ?? "").trim();
  if (explicitBase) {
    return explicitBase;
  }

  const timelinePath = String(window.__NEXTFRAME_TIMELINE_PATH ?? "").trim();
  if (!timelinePath) {
    return "";
  }

  const slashIndex = Math.max(timelinePath.lastIndexOf("/"), timelinePath.lastIndexOf("\\"));
  const directory = slashIndex >= 0 ? timelinePath.slice(0, slashIndex + 1) : timelinePath;
  return toFileHref(directory);
}

export function resolveAssetUrl(src) {
  const value = String(src ?? "").trim();
  if (!value) {
    return "";
  }

  const directHref = toFileHref(value);
  if (directHref) {
    return directHref;
  }

  const baseHref = timelineBaseHref()
    || (typeof document !== "undefined" ? document.baseURI : "")
    || (typeof window !== "undefined" ? window.location?.href || "" : "");

  if (!baseHref) {
    return value;
  }

  try {
    return new URL(value, baseHref).href;
  } catch (_) {
    return value;
  }
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url) {
  const value = String(url ?? "").trim();
  if (!value) {
    return "";
  }

  if (/^(https?:|mailto:|#|\/)/i.test(value)) {
    return value;
  }

  return "";
}

export function sanitizeHtml(value) {
  const template = document.createElement("template");
  template.innerHTML = String(value ?? "");

  const blockedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META"]);
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_ELEMENT);
  const blocked = [];

  while (walker.nextNode()) {
    const element = walker.currentNode;
    if (!(element instanceof HTMLElement)) {
      continue;
    }

    if (blockedTags.has(element.tagName)) {
      blocked.push(element);
      continue;
    }

    [...element.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name.startsWith("on")) {
        element.removeAttribute(attribute.name);
        return;
      }

      if ((name === "href" || name === "src") && sanitizeUrl(attribute.value) !== attribute.value) {
        element.removeAttribute(attribute.name);
      }
    });
  }

  blocked.forEach((element) => element.remove());
  return template.innerHTML;
}

export function formatInlineMarkdown(value) {
  const codeTokens = [];
  let text = escapeHtml(value);

  text = text.replace(/`([^`]+)`/g, (_, code) => {
    const token = `__CODE_${codeTokens.length}__`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) {
      return escapeHtml(label);
    }

    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
  });

  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  codeTokens.forEach((token, index) => {
    text = text.replace(`__CODE_${index}__`, token);
  });

  return text;
}

export function markdownToHtml(markdown) {
  const lines = String(markdown ?? "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  const paragraph = [];
  let listItems = [];
  let inCode = false;
  let codeFence = "";
  let codeLines = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }

    html.push(`<p>${formatInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  };

  const flushList = () => {
    if (listItems.length === 0) {
      return;
    }

    html.push(`<ul>${listItems.join("")}</ul>`);
    listItems = [];
  };

  const flushCode = () => {
    if (!inCode) {
      return;
    }

    const languageClass = codeFence ? ` class="language-${escapeHtml(codeFence)}"` : "";
    html.push(`<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    inCode = false;
    codeFence = "";
    codeLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const fenceMatch = line.match(/^```([\w-]+)?$/);
    if (fenceMatch) {
      if (inCode) {
        flushCode();
      } else {
        flushParagraph();
        flushList();
        inCode = true;
        codeFence = fenceMatch[1] || "";
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length;
      html.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
      continue;
    }

    if (/^---+$/.test(line)) {
      flushParagraph();
      flushList();
      html.push("<hr />");
      continue;
    }

    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      html.push(`<blockquote><p>${formatInlineMarkdown(quoteMatch[1])}</p></blockquote>`);
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      flushParagraph();
      listItems.push(`<li>${formatInlineMarkdown(listMatch[1])}</li>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();
  flushCode();

  return html.join("");
}

Object.assign(globalThis, {
  makeLinearGradient,
  resolveAssetUrl,
  escapeHtml,
  sanitizeHtml,
  formatInlineMarkdown,
  markdownToHtml,
});
