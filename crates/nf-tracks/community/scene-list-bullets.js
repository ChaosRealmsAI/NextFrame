// src/nf-tracks/community/scene-list-bullets.js
// Community L1 Track — title + 3..6 bullet list with stagger entrance.
// Contract: ADR-063 Track ABI v2 · level 1 (static) · FM-T0 gate (opacity >= 0.9).
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs, all 11 gates):
//   - single-file, zero imports, zero require, zero await import
//   - three exports: describe, sample, render (no mount/update/unmount at L1)
//   - render is a PURE function of (t, params, viewport)
//   - render(0, sample(), viewport) → HTML containing opacity >= 0.9
//   - describe().name / description (>=20 chars) / use_cases[] all present
//   - describe().level === 1 (L1 static)
//
// Allowed globals: Math, JSON, Array, Object, String, Number (no Date.now, no
// random, no DOM, no fetch). Use `t` for all time-dependent behaviour.

export function describe() {
  return {
    id: "scene-list-bullets",
    kind: "scene-list-bullets",
    level: 1,
    name: "List Bullets",
    description:
      "列表要点展示 · 顶部标题 + 3-6 bullet 项 · stagger 入场每项 150ms · bullet 样式 dot/num/check 可选 · 适合 feature 对比 / 要点拆解 / 会议结论",
    use_cases: ["feature 亮点", "要点拆解", "会议结论"],
    viewport: "any",
    // FM-T0 gate: render(t=0) opacity must be >= 0.9. Title enters at 0.92
    // with 0.08 headroom ramping to 1.0 over 250ms; items hold >= 0.9 floor.
    t0_visibility: 0.92,
    z_order_hint: 3,
    visual_channels: ["scene"],
    duration_hint_ms: 3000,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["title", "items"],
      additionalProperties: false,
      properties: {
        title: { type: "string", maxLength: 120 },
        items: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: { type: "string", maxLength: 100 },
        },
        bullet_style: {
          type: "string",
          enum: ["dot", "num", "check"],
          default: "dot",
        },
        accent_color: { type: "string", default: "#a78bfa" },
      },
    },
  };
}

export function sample() {
  return {
    title: "v1.48 为什么值得做",
    items: [
      "叙事 Track 家族覆盖 80% 短视频脚本",
      "每个 scene 都是单文件 L1 Track",
      "过 11 lint gates · 禁 iframe · 禁外部依赖",
      "PM 看 sample() 就懂 · 不用翻代码",
    ],
    bullet_style: "dot",
    accent_color: "#a78bfa",
  };
}

// ---------- helpers (kept in-file; zero-import rule forbids extraction) ----

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function escapeHtml(s) {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Render a single bullet glyph as inline HTML string. accent is a hex like
// "#a78bfa". style ∈ {"dot","num","check"}. index is 0-based for "num".
function renderBullet(style, accent, index, sizePx) {
  const s = sizePx.toFixed(0);
  if (style === "num") {
    const n = (index + 1 < 10 ? "0" : "") + (index + 1) + ".";
    const numStyle =
      "display:inline-block;width:" + s + "px;min-width:" + s + "px;" +
      "color:" + accent + ";" +
      "font-family:'SF Mono','Menlo','Monaco','Consolas',monospace;" +
      "font-weight:600;font-size:" + (sizePx * 0.78).toFixed(1) + "px;" +
      "letter-spacing:0.02em;text-align:left;line-height:1;";
    return '<span style="' + numStyle + '">' + n + "</span>";
  }
  if (style === "check") {
    // SVG checkmark · accent stroke · same box size as other bullets
    const svgStyle =
      "display:inline-block;width:" + s + "px;min-width:" + s + "px;" +
      "height:" + s + "px;line-height:1;";
    return (
      '<span style="' + svgStyle + '">' +
        '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" ' +
          'fill="none" stroke="' + accent + '" stroke-width="3" ' +
          'stroke-linecap="round" stroke-linejoin="round" ' +
          'aria-hidden="true">' +
          '<polyline points="4 12 10 18 20 6"></polyline>' +
        "</svg>" +
      "</span>"
    );
  }
  // default: dot
  const dotSize = (sizePx * 0.42).toFixed(1);
  const dotStyle =
    "display:inline-block;width:" + s + "px;min-width:" + s + "px;" +
    "height:" + s + "px;line-height:1;position:relative;";
  const innerStyle =
    "position:absolute;top:50%;left:0;transform:translateY(-50%);" +
    "width:" + dotSize + "px;height:" + dotSize + "px;border-radius:50%;" +
    "background:" + accent + ";" +
    "box-shadow:0 0 " + (sizePx * 0.5).toFixed(1) + "px " + accent + "66;";
  return (
    '<span style="' + dotStyle + '">' +
      '<span style="' + innerStyle + '"></span>' +
    "</span>"
  );
}

export function render(t, params, viewport) {
  const p = params || {};
  const vp =
    viewport && typeof viewport.w === "number" && typeof viewport.h === "number"
      ? viewport
      : { w: 1920, h: 1080 };

  const W = vp.w;
  const H = vp.h;

  const accent = /^#[0-9a-fA-F]{6}$/.test(p.accent_color || "")
    ? p.accent_color
    : "#a78bfa";

  const title = escapeHtml(p.title || "");

  // Validate / coerce bullet_style
  const rawStyle = p.bullet_style;
  const bulletStyle =
    rawStyle === "num" || rawStyle === "check" ? rawStyle : "dot";

  // Clamp items to 3..6 range per schema (defensive: if caller passes invalid,
  // we still render something rather than throw).
  const rawItems = Array.isArray(p.items) ? p.items : [];
  const clamped = rawItems.slice(0, 6);
  const items = clamped.map(function (x) {
    return escapeHtml(typeof x === "string" ? x : "");
  });

  const tNum = typeof t === "number" ? t : 0;

  // Title entrance: 0..250ms · opacity 0.92 → 1.0 (FM-T0 floor 0.9) +
  // translateY 12px → 0.
  const pT = clamp(tNum / 250, 0, 1);
  const titleOpacity = (0.92 + pT * 0.08).toFixed(3);
  const titleY = ((1 - pT) * 12).toFixed(1);

  // Responsive type scale tied to viewport height.
  const titleSize = (H * 0.07).toFixed(0);
  const itemSize = (H * 0.032).toFixed(0);
  const itemGap = (H * 0.016).toFixed(0);
  const titleGap = (H * 0.04).toFixed(0);
  const bulletBoxSize = H * 0.032; // square box aligned with item text height
  const bulletGap = (H * 0.018).toFixed(0);

  const stageStyle =
    "width:" + W + "px;height:" + H + "px;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "background:radial-gradient(ellipse 60% 55% at 50% 45%," +
      accent + "28 0%," + accent + "10 35%,#050507 82%);" +
    "font-family:-apple-system,BlinkMacSystemFont,system-ui,'Segoe UI',sans-serif;" +
    "color:#fff;position:relative;overflow:hidden;";

  const containerStyle =
    "display:flex;flex-direction:column;align-items:flex-start;" +
    "max-width:60%;width:60%;";

  const titleStyle =
    "font-size:" + titleSize + "px;font-weight:700;letter-spacing:-0.02em;" +
    "line-height:1.1;margin:0 0 " + titleGap + "px 0;color:#fff;" +
    "opacity:" + titleOpacity + ";" +
    "transform:translateY(" + titleY + "px);" +
    "text-align:left;align-self:flex-start;";

  // Per-item entrance: delay = 180 + i*150 ms · duration 260ms.
  // Opacity floor = 0.9 (FM-T0) rising to 1.0. translateX -8 → 0.
  // This keeps max opacity at t=0 >= 0.9 (render(0) gate).
  const itemsHtml = items
    .map(function (text, i) {
      const delay = 180 + i * 150;
      const pi = clamp((tNum - delay) / 260, 0, 1);
      const itemOpacity = (0.9 + pi * 0.1).toFixed(3);
      const itemX = ((1 - pi) * -8).toFixed(1);

      const bulletHtml = renderBullet(bulletStyle, accent, i, bulletBoxSize);

      const rowStyle =
        "display:flex;flex-direction:row;align-items:center;" +
        "margin:0 0 " + itemGap + "px 0;" +
        "opacity:" + itemOpacity + ";" +
        "transform:translateX(" + itemX + "px);" +
        "width:100%;";

      const bulletWrapStyle =
        "display:inline-flex;align-items:center;justify-content:flex-start;" +
        "margin-right:" + bulletGap + "px;flex-shrink:0;";

      const textStyle =
        "font-size:" + itemSize + "px;font-weight:400;letter-spacing:0.005em;" +
        "line-height:1.45;color:rgba(255,255,255,0.9);" +
        "text-align:left;";

      return (
        '<div style="' + rowStyle + '">' +
          '<span style="' + bulletWrapStyle + '">' + bulletHtml + "</span>" +
          '<span style="' + textStyle + '">' + text + "</span>" +
        "</div>"
      );
    })
    .join("");

  return (
    '<div data-layout="list-bullets" data-bullet-style="' + bulletStyle +
      '" style="' + stageStyle + '">' +
      '<div style="' + containerStyle + '">' +
        '<h1 style="' + titleStyle + '">' + title + "</h1>" +
        itemsHtml +
      "</div>" +
    "</div>"
  );
}
