export * from './easing.js';
export * from './color.js';
export * from './font.js';

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
  // Prefer design dimensions stored by engine (not affected by CSS scaling)
  const stage = container?.closest?.('[data-nf-width]');
  if (stage) {
    const w = Number(stage.dataset.nfWidth);
    const h = Number(stage.dataset.nfHeight);
    if (w > 0 && h > 0) return { width: w, height: h };
  }

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

Object.assign(globalThis, {
  toNumber,
  toBoolean,
  normalizeLines,
  normalizeArray,
  getSafeZone,
  getStageSize,
  createRoot,
  setStyle,
  createNode,
  setVisible,
  hashString,
  hashFloat,
});
