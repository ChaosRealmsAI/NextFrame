// NextFrame Shared Design System
// Shared utilities + named presets. Scenes pick a color/layout/type preset by name.
// Adding a new series = adding a new preset, no changes to utility functions.

// ═══════════════════════════════════════════════════════════════
// 1. PRESETS — named bundles of color palette + layout grid + typography
//    Scenes call getPreset(name) to load, or override via params
// ═══════════════════════════════════════════════════════════════

export const PRESETS = {
  // ── 硅谷访谈 9:16 ──
  "interview-dark": {
    colors: {
      bg: "#111111",
      primary: "#e8c47a",      // gold
      accent: "#da7756",       // warm orange
      text: "#ffffff",
      textDim: "rgba(255,255,255,0.7)",
      textFaint: "rgba(255,255,255,0.3)",
      blue: "#7ec8e3",
      tagBg: "rgba(126,200,227,0.06)",
      tagBorder: "rgba(126,200,227,0.15)",
      tagText: "#7ec8e3",
      decoLine: "rgba(232,196,122,0.12)",
      decoLineDiamond: "rgba(232,196,122,0.2)",
      gridDot: "rgba(232,196,122,0.08)",
      glowTop: "rgba(232,196,122,0.03)",
      glowBottom: "rgba(232,196,122,0.02)",
      vignette: "rgba(17,17,17,0.5)",
    },
    // 布局: 1080×1920 参考画布的绝对 px
    layout: {
      baseW: 1080, baseH: 1920,
      sidePad: 80,
      header: { top: 0, height: 260 },
      decoLine1: 258,
      video: { top: 276, height: 538, left: 80, right: 80 },
      decoLine2: 820,
      subs: { top: 830, left: 140, right: 140, height: 340 },
      timeInfo: 1186,
      topic: { top: 1224, height: 256 },
      progress: 1496,
      decoLine3: 1580,
      brand: 1590,
      teamLine: 1760,
    },
    type: {
      seriesName: { size: 44, weight: 800, spacing: "0.06em", font: "'PingFang SC','Noto Sans SC',Inter,system-ui,sans-serif" },
      title:      { size: 60, weight: 700, spacing: "-0.01em", lineHeight: 1.2, font: "'PingFang SC','Noto Sans SC',Inter,system-ui,sans-serif" },
      cnSub:      { size: 52, weight: 700, lineHeight: 1.3, font: "-apple-system,'PingFang SC','Microsoft YaHei',system-ui,sans-serif" },
      enSub:      { size: 22, weight: 400, lineHeight: 1.6, font: "-apple-system,'PingFang SC',system-ui,sans-serif" },
      topicLabel: { size: 20, weight: 600, spacing: "0.1em", font: "'PingFang SC','Noto Sans SC',sans-serif" },
      topicText:  { size: 24, weight: 500, lineHeight: 1.65, font: "'PingFang SC','Noto Sans SC',sans-serif" },
      tag:        { size: 22, weight: 500, spacing: "0.03em", font: "'SF Mono','JetBrains Mono',monospace" },
      timeInfo:   { size: 22, weight: 500, spacing: "0.05em", font: "'SF Mono','JetBrains Mono',monospace" },
      brand:      { size: 40, weight: 900, spacing: "0.2em", font: "'Iowan Old Style','Songti SC','Playfair Display',Georgia,serif" },
      teamLine:   { size: 20, weight: 500, spacing: "0.03em", font: "'SF Mono','JetBrains Mono',monospace" },
      clipLabel:  { size: 14, weight: 500, spacing: "0.08em", font: "'SF Mono','JetBrains Mono',monospace" },
    },
  },

  // ── 讲解视频 16:9 ──
  "lecture-warm": {
    colors: {
      bg: "#1a1510",
      primary: "#d4b483",      // warm gold
      accent: "#da7756",
      text: "#f5ece0",
      textDim: "rgba(245,236,224,0.6)",
      textFaint: "rgba(245,236,224,0.3)",
      green: "#7ec699",
      codeBg: "#1e1e2e",
      comment: "#6a6a7a",
      red: "#e06c75",
    },
    layout: {
      baseW: 1920, baseH: 1080,
      sidePad: 60,
      topPad: 40,
      chrome: { top: 0, height: 48 },
      content: { top: 80, left: 60, right: 60, height: 860 },
      codeArea: { top: 100, left: 60, width: 900, height: 820 },
      panelArea: { top: 100, left: 1000, width: 860, height: 820 },
      subtitle: { bottom: 60, left: 120, right: 120, height: 80 },
      progress: { bottom: 0, height: 4 },
      headline: { top: 340, left: 120, right: 120 },
    },
    type: {
      headline:      { size: 72, weight: 800, lineHeight: 1.15, font: "Georgia,'Noto Serif SC',serif" },
      subtitle:      { size: 32, weight: 500, lineHeight: 1.5, font: "system-ui,sans-serif" },
      code:          { size: 28, weight: 400, lineHeight: 1.7, font: "'SF Mono',Menlo,monospace" },
      panelTitle:    { size: 42, weight: 700, lineHeight: 1.2, font: "Georgia,'Noto Serif SC',serif" },
      panelBody:     { size: 18, weight: 400, lineHeight: 1.7, font: "system-ui,sans-serif" },
      chromeBrand:   { size: 16, weight: 700, spacing: "0.04em", font: "system-ui,sans-serif" },
      srtText:       { size: 32, weight: 500, lineHeight: 1.5, font: "system-ui,sans-serif" },
      flowNode:      { size: 28, weight: 600, font: "system-ui,sans-serif" },
    },
  },
};

/**
 * 获取预设。scene 用这个拿色板/布局/字号。
 * 找不到返回空对象，scene 用自己的 params 兜底。
 */
export function getPreset(name) {
  return PRESETS[name] || {};
}

// ═══════════════════════════════════════════════════════════════
// 2. UTILITIES — 通用工具函数，不绑定任何预设
// ═══════════════════════════════════════════════════════════════

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escAttr(value) {
  return esc(value).replace(/'/g, "&#39;");
}

export function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function easeOutCubic(value) {
  const p = clamp01(value);
  return 1 - Math.pow(1 - p, 3);
}

/** 按参考画布缩放像素值。baseW/baseH 从 preset.layout 取。 */
export function scale(vp, px, base) {
  return Math.round((vp.width * px) / (base || 1080));
}

export function scaleW(vp, px, baseW) {
  return Math.round((vp.width * px) / (baseW || 1080));
}

export function scaleH(vp, px, baseH) {
  return Math.round((vp.height * px) / (baseH || 1920));
}

export function fadeIn(t, delay, duration) {
  const d = Number.isFinite(delay) ? delay : 0;
  const dur = Number.isFinite(duration) ? duration : 0.45;
  return easeOutCubic((t - d) / Math.max(dur, 0.001));
}

// ═══════════════════════════════════════════════════════════════
// 3. SUBTITLE — 两级查找（通用，不绑定预设）
// ═══════════════════════════════════════════════════════════════

// Schema: params.segments = fine.json.segments (array)
//   segment: { s, e, speaker, en, cn: [{ text, s, e }] }
// Two-level: segment → EN + speaker, cn[] → CN text

export function findActiveSub(segments, t) {
  if (!Array.isArray(segments)) return null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (t >= seg.s && t < seg.e) {
      const cnArr = Array.isArray(seg.cn) ? seg.cn : [];
      for (let j = 0; j < cnArr.length; j++) {
        const c = cnArr[j];
        if (t >= c.s && t < c.e) {
          return { en: seg.en || "", cn: c.text || "", speaker: seg.speaker || "" };
        }
      }
      return { en: seg.en || "", cn: "", speaker: seg.speaker || "" };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// 4. DECORATIVE HELPERS — 通用装饰元素（接受颜色参数）
// ═══════════════════════════════════════════════════════════════

/** 渲染装饰分隔线 + 菱形端点。颜色从外部传入。 */
export function decoLine(vp, y, colors, baseW, baseH) {
  const lineColor = colors?.decoLine || "rgba(232,196,122,0.12)";
  const diamondColor = colors?.decoLineDiamond || "rgba(232,196,122,0.2)";
  const bgColor = colors?.bg || "#111";
  const left = scaleW(vp, 80, baseW);
  const lineY = scaleH(vp, y, baseH);
  const dSize = scaleW(vp, 10, baseW);
  return `<div style="position:absolute;left:${left}px;right:${left}px;top:${lineY}px;height:1px;background:linear-gradient(90deg,transparent,${lineColor} 20%,${lineColor} 80%,transparent);pointer-events:none">` +
    `<div style="position:absolute;left:0;top:${-dSize/2}px;width:${dSize}px;height:${dSize}px;border:1px solid ${diamondColor};transform:rotate(45deg);background:${bgColor}"></div>` +
    `<div style="position:absolute;right:0;top:${-dSize/2}px;width:${dSize}px;height:${dSize}px;border:1px solid ${diamondColor};transform:rotate(45deg);background:${bgColor}"></div>` +
    `</div>`;
}

// ═══════════════════════════════════════════════════════════════
// 5. BACKWARD COMPAT — 旧代码的快捷引用（逐步废弃）
// ═══════════════════════════════════════════════════════════════

// 旧代码用 TOKENS.interview.gold 等。保留兼容但新代码用 getPreset()。
export const TOKENS = {
  interview: PRESETS["interview-dark"]?.colors || {},
  lecture: PRESETS["lecture-warm"]?.colors || {},
};
export const GRID = PRESETS["interview-dark"]?.layout || {};
export const TYPE = PRESETS["interview-dark"]?.type || {};
export const GRID_16x9 = PRESETS["lecture-warm"]?.layout || {};
export const TYPE_16x9 = PRESETS["lecture-warm"]?.type || {};
