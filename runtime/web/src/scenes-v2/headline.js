import {
  SANS_FONT_STACK,
  createRoot,
  createNode,
  smoothstep,
  easeOutCubic,
  clamp,
  normalizeArray,
  makeLinearGradient,
  getSafeZone,
  getStageSize,
  resolveSize,
} from "../scenes-v2-shared.js";

function fitHeadline(titleWrap, chars, baseFontSize, minFontSize) {
  if (!titleWrap || !Array.isArray(chars) || chars.length === 0) {
    return baseFontSize;
  }

  const wrapWidth = titleWrap.clientWidth || titleWrap.getBoundingClientRect().width || 0;
  if (!(wrapWidth > 0)) {
    return baseFontSize;
  }

  let titleSize = baseFontSize;
  const wrapThreshold = Math.max(minFontSize, Math.round(baseFontSize * 0.6));
  titleWrap.style.flexWrap = "nowrap";
  for (const span of chars) {
    span.style.fontSize = `${titleSize}px`;
    if (span.textContent === "\u00A0") {
      span.style.width = `${Math.round(titleSize * 0.3)}px`;
    }
  }

  while (titleWrap.scrollWidth > wrapWidth * 0.9 && titleSize > wrapThreshold) {
    titleSize -= 1;
    for (const span of chars) {
      span.style.fontSize = `${titleSize}px`;
      if (span.textContent === "\u00A0") {
        span.style.width = `${Math.round(titleSize * 0.3)}px`;
      }
    }
  }

  if (titleWrap.scrollWidth > wrapWidth * 0.9) {
    titleWrap.style.flexWrap = "wrap";
  }

  return titleSize;
}

export default {
  id: "headline",
  type: "dom",
  name: "Headline",
  category: "Typography",
  tags: ["text", "title", "headline", "gradient", "stagger", "animation"],
  description: "Adaptive headline with optional subtitle, gradient text, and per-character stagger entrance",

  params: {
    text: { type: "string", default: "TITLE", desc: "Main headline text" },
    subtitle: { type: "string", default: "", desc: "Optional subtitle below headline" },
    fontSize: { type: "number", default: 0.07, desc: "Font size as a ratio of the short edge", min: 0.02, max: 0.15 },
    gradient: { type: "array", default: ["#6ee7ff", "#a78bfa", "#f472b6"], desc: "Gradient color stops" },
    stagger: { type: "number", default: 0.08, desc: "Stagger delay per character (in localT units)", min: 0.01, max: 0.3 },
  },

  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) {
      p[k] = v.default;
    }
    return p;
  },

  create(container, params) {
    const stage = getStageSize(container);
    const W = Math.max(container.clientWidth || stage.width, 1);
    const H = Math.max(container.clientHeight || stage.height, 1);
    const S = Math.min(stage.width || W, stage.height || H); // stage-based for stable font size
    const safeZone = getSafeZone(stage.width || W, stage.height || H);

    const text = String(params.text || "TITLE");
    const subtitle = String(params.subtitle || "");
    const fontSize = resolveSize(params.fontSize, S, 0.07);
    const subtitleSize = resolveSize(0.025, S, 0.025);
    const colors = normalizeArray(params.gradient, ["#6ee7ff", "#a78bfa", "#f472b6"]);
    const gradientCSS = makeLinearGradient(colors);
    const minTitleSize = Math.round(S * 0.02);

    const root = createRoot(container, [
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      `padding:${Math.round(safeZone.top)}px ${Math.round(safeZone.right)}px ${Math.round(safeZone.bottom)}px ${Math.round(safeZone.left)}px`,
      "box-sizing:border-box",
    ].join(";"));

    const titleWrap = createNode("div", [
      "display:flex",
      "flex-wrap:nowrap",
      "justify-content:center",
      "align-content:center",
      "align-items:baseline",
      `gap:${Math.round(S * 0.005)}px`,
      "width:100%",
      "max-width:90%",
      "padding:0 5%",
      "box-sizing:border-box",
      "text-align:center",
      "overflow:hidden",
      "word-break:break-word",
      "overflow-wrap:break-word",
      "will-change:transform,opacity",
    ].join(";"));

    const chars = [];
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      const span = createNode("span", [
        `font-size:${Math.round(fontSize)}px`,
        `font-family:${SANS_FONT_STACK}`,
        "font-weight:900",
        `background:${gradientCSS}`,
        "-webkit-background-clip:text",
        "background-clip:text",
        "-webkit-text-fill-color:transparent",
        "display:inline-block",
        "max-width:100%",
        "opacity:0",
        "transform:translateY(20px)",
        "will-change:transform,opacity",
        "transition:none",
        ch === " " ? `width:${Math.round(fontSize * 0.3)}px` : "",
      ].filter(Boolean).join(";"), ch === " " ? "\u00A0" : ch);
      titleWrap.appendChild(span);
      chars.push(span);
    }
    root.appendChild(titleWrap);
    const fittedTitleSize = fitHeadline(titleWrap, chars, fontSize, minTitleSize);

    let subtitleEl = null;
    if (subtitle) {
      subtitleEl = createNode("div", [
        `font-size:${Math.round(subtitleSize)}px`,
        `font-family:${SANS_FONT_STACK}`,
        "font-weight:400",
        "color:rgba(255,255,255,0.6)",
        `margin-top:${Math.round(S * 0.015)}px`,
        "max-width:90%",
        "width:100%",
        "padding:0 5%",
        "box-sizing:border-box",
        "overflow:hidden",
        "opacity:0",
        "will-change:opacity",
        "text-align:center",
        "word-break:break-word",
        "overflow-wrap:break-word",
      ].join(";"), subtitle);
      root.appendChild(subtitleEl);
    }

    return { root, titleWrap, chars, subtitleEl, S, baseTitleSize: fontSize, titleSize: fittedTitleSize, minTitleSize };
  },

  update(els, localT, params) {
    const t = clamp(localT);
    const staggerDelay = params.stagger || 0.08;
    const charCount = els.chars.length;
    const wrapWidth = els.titleWrap?.clientWidth || 0;

    if (wrapWidth > 0 && els.lastWrapWidth !== wrapWidth) {
      els.titleSize = fitHeadline(els.titleWrap, els.chars, els.baseTitleSize, els.minTitleSize);
      els.lastWrapWidth = wrapWidth;
    }

    for (let i = 0; i < charCount; i += 1) {
      const charStart = i * staggerDelay * 0.3;
      const enterEnd = charStart + 0.3;
      const exitStart = 0.8;

      const enterProgress = easeOutCubic(smoothstep(charStart, enterEnd, t));
      const exitProgress = smoothstep(exitStart, 1, t);
      const opacity = enterProgress * (1 - exitProgress);
      const translateY = (1 - enterProgress) * 20 + exitProgress * -20;

      els.chars[i].style.opacity = String(opacity);
      els.chars[i].style.transform = `translateY(${translateY}px)`;
    }

    if (els.subtitleEl) {
      const subEnter = easeOutCubic(smoothstep(0.2, 0.4, t));
      const subExit = smoothstep(0.8, 1, t);
      els.subtitleEl.style.opacity = String(subEnter * (1 - subExit));
    }
  },

  destroy(els) {
    if (els.root && els.root.parentNode) {
      els.root.parentNode.removeChild(els.root);
    }
  },
};
