// src/nf-tracks/community/scene-quote.js
// Community L1 Track — pull-quote display with giant decorative quotation mark
// in the upper-left and author attribution below the quote body.
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
    id: "scene-quote",
    kind: "scene-quote",
    level: 1,
    name: "Scene Quote",
    description:
      "金句展示场景 · 中央大号金句 + 左上方超大装饰双引号 + 下方作者署名 · 留白克制 · 作者延迟入场形成节奏 · 适合名言引用 / 章节收束 / 客户证言 / 开场引句",
    use_cases: ["名言引用", "客户证言", "章节收束", "开场引句"],
    viewport: "any",
    // FM-T0 gate: render(t=0) opacity must be >= 0.9. Quote body starts at 0.93
    // and ramps to 1.0 over 240ms. Decorative quote mark starts at 0.32.
    t0_visibility: 0.95,
    z_order_hint: 3,
    visual_channels: ["scene"],
    duration_hint_ms: 4000,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["quote"],
      additionalProperties: false,
      properties: {
        quote: { type: "string", maxLength: 400 },
        author: { type: "string", maxLength: 120 },
        accent_color: { type: "string", default: "#a78bfa" },
      },
    },
  };
}

export function sample() {
  return {
    quote: "设计不是它看起来怎样或者它感觉怎样，设计是它如何工作。",
    author: "— Steve Jobs",
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
  const quote = escapeHtml(p.quote || "");
  const author = escapeHtml(p.author || "");
  const hasAuthor = author.length > 0;

  // Entry curves.
  //   · decorative quotation mark: 0 → 300ms, opacity 0.30 → 0.35, translateY 12→0
  //   · quote body: 0 → 240ms, opacity 0.93 → 1.0 (FM-T0 floor 0.9), translateY 18→0
  //   · author (delayed 180ms): 180 → 460ms, opacity 0.88 → 0.97, translateY 14→0
  const tNum = typeof t === "number" ? t : 0;

  const pMark = clamp(tNum / 300, 0, 1);
  const markOpacity = (0.30 + pMark * 0.05).toFixed(3);
  const markY = ((1 - pMark) * 12).toFixed(1);

  const pQ = clamp(tNum / 240, 0, 1);
  const quoteOpacity = (0.93 + pQ * 0.07).toFixed(3);
  const quoteY = ((1 - pQ) * 18).toFixed(1);

  const pA = clamp((tNum - 180) / 280, 0, 1);
  const authorOpacity = hasAuthor ? (0.88 + pA * 0.09).toFixed(3) : "0";
  const authorY = hasAuthor ? ((1 - pA) * 14).toFixed(1) : "0";

  // Responsive type scale tied to viewport height so any ratio looks correct.
  const quoteSize = (H * 0.06).toFixed(0); // body · spec: h * 0.06
  const markSize = (H * 0.18).toFixed(0);  // giant decorative quote · spec: h * 0.18
  const authorSize = (H * 0.026).toFixed(0);
  const authorGap = (H * 0.05).toFixed(0);

  // Giant decorative quote positioned absolutely in the upper-left region.
  const markLeft = (W * 0.12).toFixed(0);
  const markTop = (H * 0.12).toFixed(0);

  const stageStyle =
    "width:" + W + "px;height:" + H + "px;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "background:radial-gradient(ellipse 60% 50% at 42% 40%," +
      accent + "26 0%," + accent + "10 38%,#06070a 82%);" +
    "font-family:-apple-system,BlinkMacSystemFont,system-ui,'Segoe UI',sans-serif;" +
    "color:#fff;position:relative;overflow:hidden;";

  const markStyle =
    "position:absolute;left:" + markLeft + "px;top:" + markTop + "px;" +
    "font-size:" + markSize + "px;font-weight:700;line-height:0.8;" +
    "font-family:Georgia,'Times New Roman',serif;" +
    "color:" + accent + ";" +
    "opacity:" + markOpacity + ";" +
    "transform:translateY(" + markY + "px);" +
    "pointer-events:none;user-select:none;letter-spacing:-0.04em;";

  const quoteStyle =
    "font-size:" + quoteSize + "px;font-weight:500;letter-spacing:-0.01em;" +
    "line-height:1.35;margin:0;color:#fff;" +
    "opacity:" + quoteOpacity + ";" +
    "transform:translateY(" + quoteY + "px);" +
    "text-align:center;max-width:70%;position:relative;z-index:2;";

  const authorStyle =
    "font-size:" + authorSize + "px;font-weight:400;letter-spacing:0.04em;" +
    "line-height:1.4;margin:" + authorGap + "px 0 0;" +
    "color:rgba(255,255,255,0.72);" +
    "opacity:" + authorOpacity + ";" +
    "transform:translateY(" + authorY + "px);" +
    "text-align:center;max-width:60%;position:relative;z-index:2;";

  return (
    '<div data-layout="scene-quote" style="' + stageStyle + '">' +
      '<span aria-hidden="true" style="' + markStyle + '">&ldquo;</span>' +
      '<blockquote style="' + quoteStyle + '">' + quote + "</blockquote>" +
      (hasAuthor
        ? '<p style="' + authorStyle + '">' + author + "</p>"
        : "") +
    "</div>"
  );
}
