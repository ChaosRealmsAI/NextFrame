// src/nf-tracks/community/scene-kpi-callout.js
// Community L1 Track — KPI callout with trend arrow + delta percentage.
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
    id: "scene-kpi-callout",
    kind: "scene-kpi-callout",
    level: 1,
    name: "KPI Callout",
    description:
      "KPI 数字 + 趋势箭头 + 变化百分比 · 适合财报 / OKR / 月度复盘 · trend up=绿 down=红 flat=白 · 三角形通过 CSS clip-path 绘制 · 紫粉 radial gradient 背景",
    use_cases: ["季度 KPI", "OKR 进度", "趋势对比"],
    viewport: "any",
    // FM-T0 gate: render(t=0) opacity must be >= 0.9. We target 0.92 for the
    // stage/value block with 0.08 headroom ramping to 1.0 over 300ms.
    t0_visibility: 0.95,
    z_order_hint: 3,
    visual_channels: ["scene"],
    duration_hint_ms: 3500,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["value", "label"],
      additionalProperties: false,
      properties: {
        value: { type: ["number", "string"], maxLength: 20 },
        label: { type: "string", maxLength: 60 },
        delta: { type: "string", maxLength: 20 },
        trend: { type: "string", enum: ["up", "down", "flat"], default: "up" },
        accent_color: { type: "string", default: "#a78bfa" },
      },
    },
  };
}

export function sample() {
  return {
    value: "142.8K",
    label: "MONTHLY ACTIVE USERS",
    delta: "12.5%",
    trend: "up",
    accent_color: "#a78bfa",
  };
}

// ---------- helpers (kept in-file; zero-import rule forbids extraction) ----

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function escapeHtml(s) {
  if (s === null || s === undefined) return "";
  const str = typeof s === "string" ? s : String(s);
  return str
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

  const valueRaw =
    p.value === null || p.value === undefined ? "" : p.value;
  const value = escapeHtml(valueRaw);
  const label = escapeHtml(p.label || "");
  const delta = escapeHtml(p.delta || "");

  const trendRaw = p.trend === "down" || p.trend === "flat" ? p.trend : "up";
  const trendColor =
    trendRaw === "up"
      ? "#34d399"
      : trendRaw === "down"
        ? "#f87171"
        : "#ffffff";

  // Entry curve · value/label: 0→300ms · scale 0.96→1.0 + opacity 0.92→1.0
  // (FM-T0 floor 0.9). Delta + trend arrow lag 150ms, ramp over 300ms from
  // 0.92 → 1.0 with a 6px upward translate.
  const tNum = typeof t === "number" ? t : 0;
  const pV = clamp(tNum / 300, 0, 1);
  const valueOpacity = (0.92 + pV * 0.08).toFixed(3);
  const valueScale = (0.96 + pV * 0.04).toFixed(4);

  const pD = clamp((tNum - 150) / 300, 0, 1);
  const hasDelta = delta.length > 0;
  const deltaOpacity = hasDelta ? (0.92 + pD * 0.08).toFixed(3) : "0";
  const deltaY = hasDelta ? ((1 - pD) * 6).toFixed(1) : "0";

  // Responsive type scale tied to viewport height so any ratio looks correct.
  const valueSize = (H * 0.22).toFixed(0);
  const labelSize = (H * 0.022).toFixed(0);
  const deltaSize = (H * 0.036).toFixed(0);
  const arrowSize = (H * 0.034).toFixed(0);
  const labelGap = (H * 0.025).toFixed(0);
  const deltaGap = (H * 0.03).toFixed(0);
  const trendGap = (H * 0.014).toFixed(0);

  const stageStyle =
    "width:" + W + "px;height:" + H + "px;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "background:radial-gradient(ellipse 65% 55% at 50% 45%," +
      accent + "33 0%," + accent + "14 35%,#050507 80%);" +
    "font-family:-apple-system,BlinkMacSystemFont,system-ui,'Segoe UI',sans-serif;" +
    "color:#fff;position:relative;overflow:hidden;" +
    "opacity:" + valueOpacity + ";";

  const labelStyle =
    "font-size:" + labelSize + "px;font-weight:600;letter-spacing:0.22em;" +
    "line-height:1.2;margin:0 0 " + labelGap + "px;" +
    "color:rgba(255,255,255,0.62);" +
    "text-transform:uppercase;text-align:center;max-width:70%;";

  const valueStyle =
    "font-size:" + valueSize + "px;font-weight:800;letter-spacing:-0.035em;" +
    "line-height:1.0;margin:0;color:#fff;" +
    "transform:scale(" + valueScale + ");transform-origin:50% 50%;" +
    "text-align:center;max-width:95%;" +
    "font-variant-numeric:tabular-nums;";

  const trendRowStyle =
    "display:flex;flex-direction:row;align-items:center;justify-content:center;" +
    "gap:" + trendGap + "px;margin:" + deltaGap + "px 0 0;" +
    "opacity:" + deltaOpacity + ";" +
    "transform:translateY(" + deltaY + "px);";

  // CSS clip-path triangles (pure shapes, no SVG).
  //   up   = filled triangle pointing up
  //   down = filled triangle pointing down
  //   flat = horizontal bar (degenerate triangle rendered as rectangle)
  let arrowClip;
  let arrowHeight;
  if (trendRaw === "up") {
    arrowClip = "polygon(50% 0%, 100% 100%, 0% 100%)";
    arrowHeight = arrowSize;
  } else if (trendRaw === "down") {
    arrowClip = "polygon(0% 0%, 100% 0%, 50% 100%)";
    arrowHeight = arrowSize;
  } else {
    arrowClip = "polygon(0% 35%, 100% 35%, 100% 65%, 0% 65%)";
    arrowHeight = (H * 0.022).toFixed(0);
  }

  const arrowStyle =
    "display:inline-block;width:" + arrowSize + "px;height:" + arrowHeight + "px;" +
    "background:" + trendColor + ";" +
    "clip-path:" + arrowClip + ";-webkit-clip-path:" + arrowClip + ";" +
    "flex:0 0 auto;";

  const deltaStyle =
    "font-size:" + deltaSize + "px;font-weight:700;letter-spacing:-0.01em;" +
    "line-height:1.0;margin:0;color:" + trendColor + ";" +
    "font-variant-numeric:tabular-nums;";

  const trendBlock = hasDelta
    ? (
      '<div data-role="trend" style="' + trendRowStyle + '">' +
        '<span data-role="arrow" style="' + arrowStyle + '"></span>' +
        '<span data-role="delta" style="' + deltaStyle + '">' + delta + "</span>" +
      "</div>"
    )
    : "";

  return (
    '<div data-layout="kpi-callout" data-trend="' + trendRaw + '" style="' + stageStyle + '">' +
      '<div data-role="label" style="' + labelStyle + '">' + label + "</div>" +
      '<div data-role="value" style="' + valueStyle + '">' + value + "</div>" +
      trendBlock +
    "</div>"
  );
}
