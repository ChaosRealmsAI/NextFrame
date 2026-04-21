// src/nf-tracks/community/scene-timeline.js
// Community L1 Track — horizontal timeline with 3-5 milestones.
// Contract: ADR-063 Track ABI v2 · level 1 (static) · FM-T0 gate (opacity >= 0.9).
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs, all 11 gates):
//   - single-file, zero imports, zero require, zero await import
//   - three exports: describe, sample, render (no mount/update/unmount at L1)
//   - render is a PURE function of (t, params, viewport)
//   - render(0, sample(), viewport) → HTML containing opacity >= 0.9 (milestones)
//   - describe().name / description (>=20 chars) / use_cases[] all present
//   - describe().level === 1 (L1 static)
//
// Allowed globals: Math, JSON, Array, Object, String, Number (no Date.now, no
// random, no DOM, no fetch). Use `t` for all time-dependent behaviour.

export function describe() {
  return {
    id: "scene-timeline",
    kind: "scene-timeline",
    level: 1,
    name: "Timeline",
    description:
      "水平时间轴展示 · 3-5 里程碑 · 每点 date + label 上下交替 · 横线 stagger 从左向右绘制 · 圆点带 shadow 发光 · 适合产品 roadmap / 历程回顾 / 项目进度 / 版本演进",
    use_cases: ["产品 roadmap", "项目历程", "版本演进"],
    viewport: "any",
    // FM-T0 gate: milestones render at opacity >= 0.9 at t=0. Line grows from
    // left→right, but milestone dots + text are visible immediately (>=0.9).
    t0_visibility: 0.95,
    z_order_hint: 3,
    visual_channels: ["scene"],
    duration_hint_ms: 3000,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["milestones"],
      additionalProperties: false,
      properties: {
        milestones: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "object",
            required: ["date", "label"],
            additionalProperties: false,
            properties: {
              date: { type: "string", maxLength: 20 },
              label: { type: "string", maxLength: 40 },
            },
          },
        },
        accent_color: { type: "string", default: "#a78bfa" },
      },
    },
  };
}

export function sample() {
  return {
    milestones: [
      { date: "2024 Q1", label: "项目启动" },
      { date: "2024 Q3", label: "核心 MVP 上线" },
      { date: "2025 Q1", label: "商业化验证" },
      { date: "2025 Q4", label: "规模化推广" },
    ],
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

  // Sanitize milestones array (length 3..5, fallback to sample if invalid).
  const rawList = Array.isArray(p.milestones) ? p.milestones : [];
  const list = rawList
    .filter(function (m) {
      return m && typeof m === "object";
    })
    .slice(0, 5);
  const N = list.length >= 3 ? list.length : 0;

  const tNum = typeof t === "number" ? t : 0;

  // Line width target: 70% of viewport width, centered vertically.
  const lineLeftPct = 15;
  const lineRightPct = 85;
  const lineWidthPct = lineRightPct - lineLeftPct; // 70
  // Line grows from 0 → 100% over 600ms.
  const pLine = clamp(tNum / 600, 0, 1);
  const drawnWidthPct = (lineWidthPct * pLine).toFixed(2);
  const lineOpacity = clamp(0.6 + pLine * 0.4, 0, 1).toFixed(3);
  const lineThickness = 2;

  // Type scale.
  const dateSize = (H * 0.02).toFixed(0);
  const labelSize = (H * 0.028).toFixed(0);
  const dotSize = (H * 0.024).toFixed(0);
  const dotOffset = (H * 0.012).toFixed(1); // half dot for centering
  const gapAboveLine = (H * 0.035).toFixed(0);
  const gapBelowLine = (H * 0.035).toFixed(0);

  // Stage.
  const stageStyle =
    "width:" + W + "px;height:" + H + "px;" +
    "background:radial-gradient(ellipse 70% 55% at 50% 50%," +
      accent + "22 0%," + accent + "0C 40%,#050507 80%);" +
    "font-family:-apple-system,BlinkMacSystemFont,system-ui,'Segoe UI',sans-serif;" +
    "color:#fff;position:relative;overflow:hidden;";

  // Baseline line container (absolute mid-line).
  const lineContainerStyle =
    "position:absolute;" +
    "left:" + lineLeftPct + "%;" +
    "top:50%;" +
    "width:" + lineWidthPct + "%;" +
    "height:" + lineThickness + "px;" +
    "transform:translateY(-" + (lineThickness / 2).toFixed(1) + "px);" +
    "background:rgba(255,255,255,0.08);";

  const lineFillStyle =
    "position:absolute;left:0;top:0;bottom:0;" +
    "width:" + drawnWidthPct + "%;" +
    "background:" + accent + ";" +
    "opacity:" + lineOpacity + ";" +
    "box-shadow:0 0 " + (H * 0.01).toFixed(0) + "px " + accent + "aa;";

  // Milestones.
  let milestonesHtml = "";
  for (let i = 0; i < N; i++) {
    const m = list[i];
    const dateText = escapeHtml(typeof m.date === "string" ? m.date : "");
    const labelText = escapeHtml(typeof m.label === "string" ? m.label : "");

    // Even distribution across line width.
    const xPct =
      N === 1
        ? lineLeftPct + lineWidthPct / 2
        : lineLeftPct + (lineWidthPct * i) / (N - 1);

    // Stagger-in per milestone: opacity 0.9 → 1.0 over 220ms, delayed i*200ms.
    const delay = i * 200;
    const pM = clamp((tNum - delay) / 220, 0, 1);
    const mOpacity = (0.9 + pM * 0.1).toFixed(3);
    const mScale = (0.92 + pM * 0.08).toFixed(3);
    const mTY = ((1 - pM) * 4).toFixed(1); // subtle rise

    // Alternate date/label positions: even i → date above, label below;
    // odd i → date below, label above. Avoids overlap on dense axes.
    const dateAbove = i % 2 === 0;

    const dotStyle =
      "position:absolute;" +
      "left:50%;top:50%;" +
      "width:" + dotSize + "px;height:" + dotSize + "px;" +
      "margin-left:-" + dotOffset + "px;margin-top:-" + dotOffset + "px;" +
      "border-radius:50%;" +
      "background:" + accent + ";" +
      "opacity:" + mOpacity + ";" +
      "transform:scale(" + mScale + ") translateY(" + mTY + "px);" +
      "box-shadow:0 0 " + (H * 0.018).toFixed(0) + "px " + accent + "cc," +
        "0 0 " + (H * 0.008).toFixed(0) + "px " + accent + ";";

    const dateStyle =
      "position:absolute;left:50%;" +
      (dateAbove
        ? "bottom:calc(50% + " + gapAboveLine + "px);"
        : "top:calc(50% + " + gapBelowLine + "px);") +
      "transform:translateX(-50%);" +
      "font-size:" + dateSize + "px;font-weight:600;" +
      "letter-spacing:0.22em;text-transform:uppercase;" +
      "color:" + accent + ";" +
      "opacity:" + mOpacity + ";" +
      "white-space:nowrap;";

    const labelStyle =
      "position:absolute;left:50%;" +
      (dateAbove
        ? "top:calc(50% + " + gapBelowLine + "px);"
        : "bottom:calc(50% + " + gapAboveLine + "px);") +
      "transform:translateX(-50%);" +
      "font-size:" + labelSize + "px;font-weight:500;" +
      "letter-spacing:-0.01em;line-height:1.3;" +
      "color:rgba(255,255,255,0.92);" +
      "opacity:" + mOpacity + ";" +
      "white-space:nowrap;text-align:center;";

    // Milestone column anchor: absolutely positioned at xPct, full height,
    // holds the dot at center + date/label above/below.
    const colStyle =
      "position:absolute;" +
      "left:" + xPct.toFixed(3) + "%;" +
      "top:0;bottom:0;width:0;";

    milestonesHtml +=
      '<div style="' + colStyle + '">' +
        '<div style="' + dotStyle + '"></div>' +
        '<div style="' + dateStyle + '">' + dateText + "</div>" +
        '<div style="' + labelStyle + '">' + labelText + "</div>" +
      "</div>";
  }

  return (
    '<div data-layout="scene-timeline" style="' + stageStyle + '">' +
      '<div style="' + lineContainerStyle + '">' +
        '<div style="' + lineFillStyle + '"></div>' +
      "</div>" +
      milestonesHtml +
    "</div>"
  );
}
