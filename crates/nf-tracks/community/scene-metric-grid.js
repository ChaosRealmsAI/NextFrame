// src/nf-tracks/community/scene-metric-grid.js
// Community L1 Track — 2-4 metric grid (value + label + unit per cell).
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
    id: "scene-metric-grid",
    kind: "scene-metric-grid",
    level: 1,
    name: "Metric Grid",
    description:
      "2-4 指标宫格展示 · 每 cell 数字+label+unit · 响应式 grid (2=1x2 / 3=1x3 / 4=2x2) · stagger 入场 100ms · 适合多指标对比 / 财报 / 月报 / OKR 汇总",
    use_cases: ["季度财报", "多指标汇总", "月度对比"],
    viewport: "any",
    // FM-T0 gate: render(t=0) opacity must be >= 0.9. Base stage opacity 0.95,
    // per-cell floor 0.9 ramping to 1.0 with 100ms stagger between cells.
    t0_visibility: 0.95,
    z_order_hint: 3,
    visual_channels: ["scene"],
    duration_hint_ms: 3000,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["items"],
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            required: ["label", "value"],
            additionalProperties: false,
            properties: {
              label: { type: "string", maxLength: 40 },
              value: { type: ["number", "string"] },
              unit: { type: "string", maxLength: 8 },
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
    items: [
      { label: "月活用户", value: 142, unit: "K" },
      { label: "营收", value: 38.6, unit: "M" },
      { label: "留存率", value: 67, unit: "%" },
      { label: "NPS", value: 52 },
    ],
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

function gridLayout(n) {
  // 2 → 1 row x 2 cols · 3 → 1 row x 3 cols · 4 → 2 rows x 2 cols
  if (n <= 2) return { cols: 2, rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  return { cols: 2, rows: 2 };
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

  const rawItems = Array.isArray(p.items) ? p.items : [];
  // Clamp 2-4 items (schema enforces, but render is defensive).
  const items = rawItems.slice(0, 4);
  const n = items.length < 2 ? 2 : items.length;
  const layout = gridLayout(n);

  const tNum = typeof t === "number" ? t : 0;

  // Responsive sizing: value (h*0.14) + label (h*0.022) + unit (value * 0.3).
  const valueSize = (H * 0.14).toFixed(0);
  const labelSize = (H * 0.022).toFixed(0);
  const unitSize = (H * 0.14 * 0.3).toFixed(0);
  const gap = (W * 0.04).toFixed(0);

  const stageStyle =
    "width:" + W + "px;height:" + H + "px;" +
    "display:flex;align-items:center;justify-content:center;" +
    "background:radial-gradient(ellipse 70% 60% at 50% 50%," +
      accent + "33 0%," + accent + "14 38%,#050507 82%);" +
    "font-family:-apple-system,BlinkMacSystemFont,system-ui,'Segoe UI',sans-serif;" +
    "color:#fff;position:relative;overflow:hidden;";

  const gridStyle =
    "display:grid;" +
    "grid-template-columns:repeat(" + layout.cols + ",1fr);" +
    "grid-template-rows:repeat(" + layout.rows + ",auto);" +
    "gap:" + gap + "px;" +
    "width:" + (W * 0.82).toFixed(0) + "px;" +
    "align-items:center;justify-items:center;";

  const cellsHtml = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const label = escapeHtml(it.label);
    const value = escapeHtml(it.value);
    const unit = escapeHtml(it.unit);
    const hasUnit = unit.length > 0;

    // Per-cell stagger: cell_i opacity = 0.9 + min(1, (t - i*100)/250) * 0.1
    const pC = clamp((tNum - i * 100) / 250, 0, 1);
    const cellOpacity = (0.9 + pC * 0.1).toFixed(3);
    const cellY = ((1 - pC) * 14).toFixed(1);

    const cellStyle =
      "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "opacity:" + cellOpacity + ";" +
      "transform:translateY(" + cellY + "px);" +
      "text-align:center;";

    const valueRowStyle =
      "display:flex;align-items:baseline;justify-content:center;gap:0.08em;" +
      "line-height:1;";

    const valueStyle =
      "font-size:" + valueSize + "px;font-weight:800;letter-spacing:-0.03em;" +
      "line-height:1;color:#fff;margin:0;";

    const unitStyle =
      "font-size:" + unitSize + "px;font-weight:600;letter-spacing:-0.01em;" +
      "color:" + accent + ";margin:0;";

    const labelStyle =
      "font-size:" + labelSize + "px;font-weight:500;letter-spacing:0.06em;" +
      "text-transform:uppercase;" +
      "color:rgba(255,255,255,0.72);margin:" + (H * 0.012).toFixed(0) + "px 0 0;";

    const valueRow =
      '<div style="' + valueRowStyle + '">' +
        '<span style="' + valueStyle + '">' + value + "</span>" +
        (hasUnit ? '<span style="' + unitStyle + '">' + unit + "</span>" : "") +
      "</div>";

    cellsHtml.push(
      '<div data-cell="' + i + '" style="' + cellStyle + '">' +
        valueRow +
        '<div style="' + labelStyle + '">' + label + "</div>" +
      "</div>"
    );
  }

  return (
    '<div data-layout="metric-grid" data-count="' + items.length + '" style="' + stageStyle + '">' +
      '<div style="' + gridStyle + '">' + cellsHtml.join("") + "</div>" +
    "</div>"
  );
}
