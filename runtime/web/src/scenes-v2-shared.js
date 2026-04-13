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

export function getSafeZone(W, H) {
  const isVertical = H > W;
  return {
    top: isVertical ? H * 0.15 : H * 0.05,
    bottom: isVertical ? H * 0.10 : H * 0.05,
    left: isVertical ? W * 0.05 : W * 0.03,
    right: isVertical ? W * 0.05 : W * 0.03,
  };
}

function pickStageDimension(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 1) {
      return numeric;
    }
  }
  return 1;
}

export function getStageSize(container) {
  const rect = typeof container?.getBoundingClientRect === "function"
    ? container.getBoundingClientRect()
    : null;
  const parent = container?.parentElement || null;
  const parentRect = typeof parent?.getBoundingClientRect === "function"
    ? parent.getBoundingClientRect()
    : null;
  const docEl = typeof document !== "undefined" ? document.documentElement : null;
  const win = typeof window !== "undefined" ? window : null;

  return {
    width: pickStageDimension(
      container?.clientWidth,
      rect?.width,
      parent?.clientWidth,
      parentRect?.width,
      docEl?.clientWidth,
      win?.innerWidth,
    ),
    height: pickStageDimension(
      container?.clientHeight,
      rect?.height,
      parent?.clientHeight,
      parentRect?.height,
      docEl?.clientHeight,
      win?.innerHeight,
    ),
  };
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

/**
 * Resolve a size value to pixels.
 * Accepts: number 0~1 (ratio of S), number >=1 (px), "48px", "large", etc.
 * S = Math.min(containerWidth, containerHeight)
 */
export function resolveSize(value, S, fallback = 0.03) {
  if (value == null) return Math.round(S * fallback);
  if (typeof value === 'number') {
    return value < 1 ? Math.round(S * value) : Math.round(value);
  }
  const str = String(value).trim().toLowerCase();
  const keywords = { xxsmall: 0.012, xsmall: 0.016, small: 0.02, medium: 0.035, large: 0.05, xlarge: 0.07, xxlarge: 0.1 };
  if (keywords[str]) return Math.round(S * keywords[str]);
  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? Math.round(parsed < 1 ? S * parsed : parsed) : Math.round(S * fallback);
}

export function shrinkTextToFit(element, options = {}) {
  if (!element) {
    return 0;
  }

  const container = options.container || element.parentElement;
  if (!container) {
    return 0;
  }

  const computed = typeof window !== "undefined" ? window.getComputedStyle(element) : null;
  let fontSize = parseFloat(options.fontSize ?? computed?.fontSize ?? "0");
  if (!Number.isFinite(fontSize) || fontSize <= 0) {
    return 0;
  }

  const ratio = Number.isFinite(options.maxWidthRatio) ? options.maxWidthRatio : 0.9;
  const containerWidth = options.maxWidth
    ?? container.clientWidth
    ?? container.getBoundingClientRect?.().width
    ?? 0;
  const maxWidth = Math.max(0, containerWidth * ratio);
  const minFontSize = Math.max(1, Number(options.minFontSize) || 1);
  const maxIterations = Math.max(1, Number(options.maxIterations) || 64);

  if (!(maxWidth > 0)) {
    return Math.round(fontSize);
  }

  let iterations = 0;
  while (fontSize > minFontSize && iterations < maxIterations) {
    const tooWide = element.scrollWidth > maxWidth + 1;
    const tooTall = options.maxHeight > 0 && element.scrollHeight > options.maxHeight + 1;
    if (!tooWide && !tooTall) {
      break;
    }

    fontSize -= 1;
    element.style.fontSize = `${fontSize}px`;
    iterations += 1;
  }

  return Math.round(fontSize);
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
