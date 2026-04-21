// src/nf-tracks/community/scene-hero-split.js
// Community L1 Track · Hero Split — 左右分栏 Hero layout
//
// 左 55% 文字（title + subtitle 左对齐）· 右 45% CSS 几何图形（circle / triangle /
// hexagon · radial gradient 2.5D 体积感）· 入场：文字从左滑入 + 图形 scale-in ·
// stagger 100ms · FM-T0 ≥ 0.9 · 响应式字号（viewport.h 相对）.
//
// Contract: ADR-033 Track ABI v1.1 + ADR-063 (Track ABI v2 · L1/L2/L3) +
// FM-T0 gate (ADR-027).
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs · 11 gates):
//   - single-file · zero imports / require / await import
//   - 3 required exports (describe / sample / render) · L1 无 mount/update/unmount
//   - render is a PURE function of (t, params, viewport); at t=0 max opacity ≥ 0.9
//   - describe().name / description (≥20 字) / use_cases (非空 string[]) 齐
//   - level = 1 · 纯 CSS · 禁 shader / keynote 重材质
//
// Allowed globals: Math, JSON, Array, Object, String, Number (no Date.now, no
// random, no DOM, no fetch). Use `t` for all time-dependent behaviour.

export function describe() {
  return {
    id: "scene-hero-split",
    kind: "scene-hero-split",
    level: 1,
    name: "Hero Split",
    description:
      "左右分栏 Hero · 左 55% 标题+副标 · 右 45% CSS 几何图形 radial gradient 2.5D 体积 · 文字左滑入 + 图形 scale 入场 · 适合产品介绍 / 功能亮相 / 对比展示",
    use_cases: ["产品介绍", "功能亮相", "章节起始"],
    viewport: "any",
    // FM-T0: render(t=0) max opacity must be ≥ 0.9. Target 0.92 with headroom.
    t0_visibility: 0.95,
    z_order_hint: 3,
    visual_channels: ["scene"],
    duration_hint_ms: 4000,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["title"],
      additionalProperties: false,
      properties: {
        title: { type: "string", maxLength: 100 },
        subtitle: { type: "string", maxLength: 200 },
        accent_color: { type: "string", default: "#a78bfa" },
        visual_shape: {
          type: "string",
          enum: ["circle", "triangle", "hexagon"],
          default: "circle",
        },
      },
    },
  };
}

export function sample() {
  return {
    title: "Canvas + WebGL",
    subtitle: "一个 JS 文件 · 浏览器能画的都能用",
    accent_color: "#f472b6",
    visual_shape: "circle",
  };
}

// ---------- helpers (zero-import rule forbids extraction) ------------------

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

function sanitizeColor(c, fallback) {
  if (typeof c !== "string") return fallback;
  // Accept #rgb / #rrggbb / rgb(a) / hsl(a) / named — keep simple safe subset.
  if (/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(c)) return c;
  if (/^(rgb|hsl)a?\([0-9.,%\s]+\)$/.test(c)) return c;
  return fallback;
}

// Eased 0→1 ramp over [t0,t1]. Uses cubic ease-out for snappy entry.
function rampAt(t, t0, t1) {
  const frac = clamp((t - t0) / (t1 - t0), 0, 1);
  // ease-out cubic: 1 - (1-f)^3
  const e = 1 - Math.pow(1 - frac, 3);
  return e;
}

// Title opacity at t: 0.92 → 1 across 0-300ms (FM-T0 ≥ 0.9 at t=0)
function titleOpacityAt(t) {
  return 0.92 + 0.08 * rampAt(t, 0, 300);
}

// Title translateX px at t: -30 → 0 across 0-300ms
function titleTxAt(t) {
  return -30 * (1 - rampAt(t, 0, 300));
}

// Subtitle staggered 120ms behind title; same shape (120-420ms)
function subtitleOpacityAt(t) {
  return 0.92 + 0.08 * rampAt(t, 120, 420);
}

function subtitleTxAt(t) {
  return -30 * (1 - rampAt(t, 120, 420));
}

// Shape scale: 0.88 → 1 across 200-500ms
function shapeScaleAt(t) {
  return 0.88 + 0.12 * rampAt(t, 200, 500);
}

// Shape opacity: 0.9 → 1 across 200-500ms (also satisfies FM-T0 at t=0 since 0.9)
function shapeOpacityAt(t) {
  return 0.9 + 0.1 * rampAt(t, 200, 500);
}

// clip-path for the chosen shape; circle uses border-radius separately.
function shapeClipPath(shape) {
  if (shape === "triangle") {
    return "polygon(50% 2%, 98% 96%, 2% 96%)";
  }
  if (shape === "hexagon") {
    return "polygon(50% 0%, 95% 25%, 95% 75%, 50% 100%, 5% 75%, 5% 25%)";
  }
  // circle — clip-path not needed (border-radius:50%), but harmless for unity.
  return "none";
}

function shapeStyle(shape, accent, size, scale, opacity) {
  // radial gradient: accent core → accent edge → transparent, off-center top-left
  // for a soft 2.5D volume highlight. Alpha suffixes (#cc / #44) concatenated
  // onto the hex accent give depth without extra color math.
  const grad =
    "radial-gradient(circle at 32% 28%, " +
    accent +
    " 0%, " +
    accent +
    "cc 38%, " +
    accent +
    "44 72%, transparent 100%)";

  const base =
    "width:" + size + "px;height:" + size + "px;" +
    "background:" + grad + ";" +
    "opacity:" + opacity.toFixed(3) + ";" +
    "transform:scale(" + scale.toFixed(4) + ");" +
    "transform-origin:50% 50%;" +
    "filter:drop-shadow(0 12px 48px " + accent + "55);";

  if (shape === "circle") {
    return base + "border-radius:50%;";
  }
  return base + "clip-path:" + shapeClipPath(shape) + ";";
}

// ---------- render --------------------------------------------------------

export function render(t, params, viewport) {
  const p = params || {};
  const vp =
    viewport && typeof viewport.w === "number" && typeof viewport.h === "number"
      ? viewport
      : { w: 1920, h: 1080 };

  const accent = sanitizeColor(p.accent_color, "#a78bfa");
  const shape =
    p.visual_shape === "triangle" || p.visual_shape === "hexagon"
      ? p.visual_shape
      : "circle";

  const title = escapeHtml(p.title || "");
  const subtitle = escapeHtml(p.subtitle || "");

  // Responsive sizes — all scale with viewport.h so any ratio fits.
  const titleSize = Math.round(vp.h * 0.085);
  const subSize = Math.round(vp.h * 0.024);
  const gapY = Math.round(vp.h * 0.022);
  const padX = Math.round(vp.w * 0.06);
  const shapeSize = Math.round(vp.h * 0.5);

  // Entry animation values
  const titleOp = titleOpacityAt(t);
  const titleTx = titleTxAt(t);
  const subOp = subtitleOpacityAt(t);
  const subTx = subtitleTxAt(t);
  const shapeScale = shapeScaleAt(t);
  const shapeOp = shapeOpacityAt(t);

  // Stage: dark background #050507 + subtle ambient glow tinted by accent
  const stage =
    "position:absolute;inset:0;" +
    "width:" + vp.w + "px;height:" + vp.h + "px;" +
    "display:flex;flex-direction:row;align-items:stretch;" +
    "background:#050507;" +
    "background-image:radial-gradient(ellipse at 70% 50%, " + accent + "1a 0%, transparent 55%);" +
    "color:#f5f3ff;" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC',sans-serif;" +
    "overflow:hidden;";

  // Left 55% — text column, left-aligned, vertically centered
  const leftStyle =
    "flex:0 0 55%;" +
    "display:flex;flex-direction:column;justify-content:center;align-items:flex-start;" +
    "padding:0 " + Math.round(padX * 0.6) + "px 0 " + padX + "px;" +
    "box-sizing:border-box;";

  const titleStyle =
    "font-size:" + titleSize + "px;font-weight:700;letter-spacing:-0.02em;" +
    "line-height:1.08;text-align:left;" +
    "background:linear-gradient(180deg,#ffffff 0%," + accent + " 100%);" +
    "-webkit-background-clip:text;background-clip:text;color:transparent;" +
    "opacity:" + titleOp.toFixed(3) + ";" +
    "transform:translateX(" + titleTx.toFixed(2) + "px);" +
    "will-change:transform,opacity;";

  const subtitleStyle =
    "margin-top:" + gapY + "px;" +
    "font-size:" + subSize + "px;font-weight:400;" +
    "color:#a8a3c7;letter-spacing:0.02em;line-height:1.45;text-align:left;" +
    "opacity:" + subOp.toFixed(3) + ";" +
    "transform:translateX(" + subTx.toFixed(2) + "px);" +
    "will-change:transform,opacity;";

  // Right 45% — visual shape, centered
  const rightStyle =
    "flex:0 0 45%;" +
    "display:flex;align-items:center;justify-content:center;" +
    "padding:0 " + padX + "px 0 " + Math.round(padX * 0.6) + "px;" +
    "box-sizing:border-box;";

  return (
    '<div data-layout="hero-split" data-shape="' + shape + '" style="' + stage + '">' +
      '<div data-slot="text" style="' + leftStyle + '">' +
        '<div data-slot="title" style="' + titleStyle + '">' + title + '</div>' +
        (subtitle
          ? '<div data-slot="subtitle" style="' + subtitleStyle + '">' + subtitle + '</div>'
          : "") +
      '</div>' +
      '<div data-slot="visual" style="' + rightStyle + '">' +
        '<div data-slot="shape" style="' + shapeStyle(shape, accent, shapeSize, shapeScale, shapeOp) + '"></div>' +
      '</div>' +
    '</div>'
  );
}
