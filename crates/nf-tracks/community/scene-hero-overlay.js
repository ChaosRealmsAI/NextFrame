// src/nf-tracks/community/scene-hero-overlay.js
// Community L1 Track · 全屏大字覆盖 Hero overlay
//
// 设计：上方 kicker 小字（tracked letters · uppercase）+ 居中下方超大 headline
// （viewport.h * 0.22）· 微微辐射背景 · 极简 · scale 0.94→1 + opacity 0.9→1 入场。
// 场景：数字宣言 / 章节标题 / 开场大字 / 发布会号召。
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs · 11 gates):
//   - single-file · zero imports / require / await import
//   - render is a PURE function of (t, params, viewport)
//   - render(0, sample(), viewport) → opacity >= 0.9 (FM-T0 gate)
//   - level = 1 · no mount/update/unmount hooks
//   - describe().name / description (>=20) / use_cases (non-empty string[])

export function describe() {
  return {
    id: "scene-hero-overlay",
    kind: "scene-hero-overlay",
    level: 1,
    name: "Hero Overlay",
    description:
      "全屏大字覆盖 Hero · 上方 kicker 小字 + 下方超大 headline · 极简设计 · scale+opacity 入场 · 适合大字宣言 / 数字号召 / 章节标题切换",
    use_cases: ["数字宣言", "章节标题", "开场大字"],
    viewport: "any",
    t0_visibility: 0.95,
    z_order_hint: 4,
    visual_channels: ["scene"],
    duration_hint_ms: 3500,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["headline"],
      additionalProperties: false,
      properties: {
        headline: { type: "string", maxLength: 60 },
        kicker: { type: "string", maxLength: 40 },
        accent_color: { type: "string", default: "#a78bfa" },
      },
    },
  };
}

export function sample() {
  return {
    headline: "10 万粒子",
    kicker: "WEBGL · L2 TRACK",
    accent_color: "#a78bfa",
  };
}

// ---------- helpers (in-file · zero-import rule) ----------

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

function isHex6(s) {
  return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
}

export function render(t, params, viewport) {
  const p = params || {};
  const vp =
    viewport && typeof viewport.w === "number" && typeof viewport.h === "number"
      ? viewport
      : { w: 1920, h: 1080 };
  const W = vp.w;
  const H = vp.h;
  const accent = isHex6(p.accent_color) ? p.accent_color : "#a78bfa";

  // Entry: t=0 opacity 0.9 + scale 0.94 · 300ms 到 1 (FM-T0 lower bound 0.9)
  const pT = clamp(t / 300, 0, 1);
  const scale = 0.94 + pT * 0.06;
  const opacity = 0.9 + pT * 0.1;

  // kicker 延迟 80ms 再入场 · opacity 0→0.97
  const pK = clamp((t - 80) / 260, 0, 1);
  const kickerOp = 0.85 + pK * 0.12;

  const headline = escapeHtml(p.headline || "");
  const kickerRaw = typeof p.kicker === "string" ? p.kicker : "";
  const kicker = escapeHtml(kickerRaw);

  const headSize = Math.round(H * 0.22);
  const kickSize = Math.round(H * 0.022);
  const gap = Math.round(H * 0.035);

  const stageStyle =
    "position:absolute;inset:0;" +
    "width:" + W + "px;height:" + H + "px;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "background:radial-gradient(ellipse 80% 45% at 50% 50%," +
    accent + "18 0%," + accent + "08 50%,#050507 80%);" +
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;" +
    "color:#fff;overflow:hidden;" +
    "opacity:" + opacity.toFixed(3) + ";";

  const kickerBlock = kickerRaw
    ? '<p style="' +
        "font-size:" + kickSize + "px;font-weight:600;" +
        "letter-spacing:0.25em;text-transform:uppercase;" +
        "color:" + accent + ";" +
        "opacity:" + kickerOp.toFixed(3) + ";" +
        "margin:0 0 " + gap + "px 0;" +
      '">' + kicker + '</p>'
    : "";

  const headlineBlock =
    '<h1 style="' +
      "font-size:" + headSize + "px;font-weight:900;" +
      "letter-spacing:-0.04em;line-height:0.95;margin:0;color:#fff;" +
      "text-align:center;max-width:90%;" +
      "transform:scale(" + scale.toFixed(4) + ");transform-origin:50% 50%;" +
      "opacity:" + opacity.toFixed(3) + ";" +
    '">' + headline + '</h1>';

  return (
    '<div data-layout="hero-overlay" style="' + stageStyle + '">' +
      kickerBlock +
      headlineBlock +
    '</div>'
  );
}
