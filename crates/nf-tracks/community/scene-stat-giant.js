// src/nf-tracks/community/scene-stat-giant.js
// Community L1 Track — giant single-number stat with count-up animation.
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
    id: "scene-stat-giant",
    kind: "scene-stat-giant",
    level: 1,
    name: "Stat Giant",
    description:
      "巨型单数字展示 · count-up 动画 · 里程碑 / 总数 / 关键指标 · 数字字号 viewport.h*0.32 · 下方 label · 右上 unit · 居中紫粉 radial gradient 背景",
    use_cases: ["关键里程碑", "用户总数", "月报单指标"],
    viewport: "any",
    // FM-T0 gate: render(t=0) opacity must be >= 0.9. Stage base opacity is
    // 0.92 at t=0 ramping to 1.0; number value starts at 2% of target so the
    // digit is visibly present (not 0 flicker) before count-up begins.
    t0_visibility: 0.95,
    z_order_hint: 3,
    visual_channels: ["scene"],
    duration_hint_ms: 3000,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["number"],
      additionalProperties: false,
      properties: {
        number: { type: "number" },
        label: { type: "string", maxLength: 80 },
        unit: { type: "string", maxLength: 8 },
        accent_color: { type: "string", default: "#a78bfa" },
      },
    },
  };
}

export function sample() {
  return {
    number: 1200000,
    label: "累计用户数",
    unit: "+",
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

// Format integer with thousand-separator commas. Preserves sign.
function formatInt(n) {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(Math.round(n));
  const s = String(abs);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s.charAt(i);
  }
  return sign + out;
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
  const target = typeof p.number === "number" && isFinite(p.number) ? p.number : 0;
  const label = escapeHtml(p.label || "");
  const unit = escapeHtml(p.unit || "");

  // Entry curve · count-up: 0→1000ms · easeOutQuart for organic deceleration.
  // At t=0 we show 2% of target (not 0) to avoid "empty digit flash" — the
  // number is immediately legible while the ramp still reads as count-up.
  const tNum = typeof t === "number" ? t : 0;
  const pCount = clamp(tNum / 1000, 0, 1);
  const eased = 1 - Math.pow(1 - pCount, 4);
  const startFrac = 0.02;
  const displayFrac = startFrac + (1 - startFrac) * eased;
  const displayNum = tNum <= 0
    ? Math.round(target * startFrac)
    : tNum >= 1000
    ? Math.round(target)
    : Math.round(target * displayFrac);
  const numberText = formatInt(displayNum);

  // Stage opacity · 0.92 → 1.0 over 250ms (FM-T0 floor 0.9).
  const pStage = clamp(tNum / 250, 0, 1);
  const stageOpacity = (0.92 + pStage * 0.08).toFixed(3);

  // Label fade-in · 200ms delay · 0.85 → 1.0 over 300ms.
  const pLabel = clamp((tNum - 200) / 300, 0, 1);
  const hasLabel = label.length > 0;
  const labelOpacity = hasLabel ? (0.85 + pLabel * 0.15).toFixed(3) : "0";
  const labelY = hasLabel ? ((1 - pLabel) * 14).toFixed(1) : "0";

  // Responsive type scale tied to viewport height.
  const numSize = (H * 0.32).toFixed(0);
  const unitSize = (H * 0.32 * 0.18).toFixed(0);
  const labelSize = (H * 0.032).toFixed(0);
  const labelGap = (H * 0.02).toFixed(0);

  const stageStyle =
    "width:" + W + "px;height:" + H + "px;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "background:radial-gradient(ellipse 65% 55% at 50% 45%," +
      accent + "33 0%," + accent + "14 35%,#050507 80%);" +
    "font-family:-apple-system,BlinkMacSystemFont,system-ui,'Segoe UI',sans-serif;" +
    "color:#fff;position:relative;overflow:hidden;" +
    "opacity:" + stageOpacity + ";";

  // Number wrapper is inline-flex with unit positioned top-right of the digit
  // block so layout stays centered regardless of digit count.
  const numWrapStyle =
    "position:relative;display:inline-flex;align-items:flex-start;" +
    "line-height:0.95;";

  const numStyle =
    "font-size:" + numSize + "px;font-weight:800;letter-spacing:-0.04em;" +
    "line-height:0.95;margin:0;color:#fff;" +
    "font-variant-numeric:tabular-nums;" +
    "text-align:center;";

  const unitStyle =
    "font-size:" + unitSize + "px;font-weight:700;letter-spacing:-0.01em;" +
    "margin-left:" + (H * 0.01).toFixed(0) + "px;" +
    "color:" + accent + ";" +
    "line-height:1;align-self:flex-start;" +
    "margin-top:" + (H * 0.02).toFixed(0) + "px;";

  const labelStyle =
    "font-size:" + labelSize + "px;font-weight:500;letter-spacing:0.04em;" +
    "line-height:1.3;margin:" + labelGap + "px 0 0;" +
    "color:rgba(255,255,255,0.82);" +
    "opacity:" + labelOpacity + ";" +
    "transform:translateY(" + labelY + "px);" +
    "text-align:center;max-width:75%;" +
    "text-transform:uppercase;";

  return (
    '<div data-layout="stat-giant" style="' + stageStyle + '">' +
      '<div style="' + numWrapStyle + '">' +
        '<span style="' + numStyle + '">' + numberText + "</span>" +
        (unit.length > 0
          ? '<span style="' + unitStyle + '">' + unit + "</span>"
          : "") +
      "</div>" +
      (hasLabel
        ? '<p style="' + labelStyle + '">' + label + "</p>"
        : "") +
    "</div>"
  );
}
