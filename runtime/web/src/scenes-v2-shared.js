export const SANS_FONT_STACK = '-apple-system, "SF Pro Display", "PingFang SC", sans-serif';
export const MONO_FONT_STACK = '"SF Mono", "Fira Code", Menlo, monospace';
export const SERIF_FONT_STACK = '"Iowan Old Style", "Times New Roman", "Songti SC", serif';

export function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(start, end, progress) {
  return start + ((end - start) * progress);
}

export function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }

  const progress = clamp((value - edge0) / (edge1 - edge0));
  return progress * progress * (3 - (2 * progress));
}

export function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

export function easeInCubic(value) {
  return value ** 3;
}

export function easeOutBack(value) {
  const overshoot = 1.70158;
  const shifted = value - 1;
  return 1 + ((overshoot + 1) * (shifted ** 3)) + (overshoot * (shifted ** 2));
}

export function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function toBoolean(value, fallback = false) {
  if (value === true || value === false) {
    return value;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return fallback;
}

export function normalizeLines(value) {
  return String(value ?? "").replace(/\r\n/g, "\n").split("\n");
}

export function normalizeArray(value, fallback = []) {
  return Array.isArray(value) ? value : fallback;
}

export function createRoot(container, extraStyles = "") {
  const root = document.createElement("div");
  root.style.cssText = [
    "position:absolute",
    "inset:0",
    "overflow:hidden",
    "pointer-events:none",
    extraStyles,
  ].filter(Boolean).join(";");
  container.appendChild(root);
  return root;
}

export function setStyle(element, styles) {
  element.style.cssText = styles;
  return element;
}

export function createNode(tagName, styles = "", text = "") {
  const element = document.createElement(tagName);
  if (styles) {
    element.style.cssText = styles;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

export function setVisible(element, visible) {
  element.style.display = visible ? "" : "none";
}

export function hashString(value) {
  let result = 2166136261;
  const text = String(value ?? "");

  for (let index = 0; index < text.length; index += 1) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }

  return result >>> 0;
}

export function hashFloat(seed, salt = "") {
  let value = (Math.imul((seed | 0) ^ 0x9e3779b9, 1597334677) ^ hashString(salt)) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 2246822519) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 3266489917) >>> 0;
  value ^= value >>> 16;
  return value / 4294967295;
}

export function makeLinearGradient(colors, fallback = ["#ffffff"]) {
  const palette = normalizeArray(colors, fallback).filter(Boolean);
  return `linear-gradient(135deg, ${(palette.length > 0 ? palette : fallback).join(", ")})`;
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
