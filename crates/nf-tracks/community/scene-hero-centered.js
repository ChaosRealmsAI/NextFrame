// src/nf-tracks/community/scene-hero-centered.js
// Community L1 Track — centered hero headline + optional subtitle.
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
    id: "scene-hero-centered",
    kind: "scene-hero-centered",
    level: 1,
    name: "Hero Centered",
    description:
      "居中 Hero 场景 · 超大标题加可选副标题 · 紫粉 radial gradient 辐射感背景 · 入场淡入 stagger · 适合开场 / 品牌发布 / 章节起始",
    use_cases: ["品牌开场", "章节起始", "关键宣言"],
    viewport: "any",
    // FM-T0 gate: render(t=0) opacity must be >= 0.9. We target 0.92 for title
    // with 0.08 headroom ramping to 1.0 over 250ms.
    t0_visibility: 0.95,
    z_order_hint: 3,
    visual_channels: ["scene"],
    duration_hint_ms: 3000,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["title"],
      additionalProperties: false,
      properties: {
        title: { type: "string", maxLength: 100 },
        subtitle: { type: "string", maxLength: 200 },
        accent_color: { type: "string", default: "#a78bfa" },
      },
    },
  };
}

export function sample() {
  return {
    title: "NextFrame",
    subtitle: "AI 视频引擎 · 让数据说话",
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
  const title = escapeHtml(p.title || "");
  const subtitle = escapeHtml(p.subtitle || "");

  // Entry curve · title: 0→250ms · opacity 0.92 → 1.0 (FM-T0 floor 0.9) +
  // translateY 20px → 0. Subtitle lags 80ms, ramps over 280ms from 0.85 → 0.97.
  const tNum = typeof t === "number" ? t : 0;
  const pT = clamp(tNum / 250, 0, 1);
  const titleOpacity = (0.92 + pT * 0.08).toFixed(3);
  const titleY = ((1 - pT) * 20).toFixed(1);

  const pS = clamp((tNum - 80) / 280, 0, 1);
  const hasSub = subtitle.length > 0;
  const subOpacity = hasSub ? (0.85 + pS * 0.12).toFixed(3) : "0";
  const subY = hasSub ? ((1 - pS) * 16).toFixed(1) : "0";

  // Responsive type scale tied to viewport height so any ratio looks correct.
  const titleSize = (H * 0.11).toFixed(0);
  const subSize = (H * 0.028).toFixed(0);
  const subGap = (H * 0.02).toFixed(0);

  const stageStyle =
    "width:" + W + "px;height:" + H + "px;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "background:radial-gradient(ellipse 65% 55% at 50% 45%," +
      accent + "33 0%," + accent + "14 35%,#050507 80%);" +
    "font-family:-apple-system,BlinkMacSystemFont,system-ui,'Segoe UI',sans-serif;" +
    "color:#fff;position:relative;overflow:hidden;";

  const titleStyle =
    "font-size:" + titleSize + "px;font-weight:800;letter-spacing:-0.03em;" +
    "line-height:1.05;margin:0;color:#fff;" +
    "opacity:" + titleOpacity + ";" +
    "transform:translateY(" + titleY + "px);" +
    "text-align:center;max-width:85%;";

  const subStyle =
    "font-size:" + subSize + "px;font-weight:400;letter-spacing:0.02em;" +
    "line-height:1.4;margin:" + subGap + "px 0 0;" +
    "color:rgba(255,255,255,0.78);" +
    "opacity:" + subOpacity + ";" +
    "transform:translateY(" + subY + "px);" +
    "text-align:center;max-width:70%;";

  return (
    '<div data-layout="hero-centered" style="' + stageStyle + '">' +
      '<h1 style="' + titleStyle + '">' + title + "</h1>" +
      (hasSub
        ? '<p style="' + subStyle + '">' + subtitle + "</p>"
        : "") +
    "</div>"
  );
}
