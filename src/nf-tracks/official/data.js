// src/nf-tracks/official/data.js
// Official "data" Track — ranking / finance / comparison tables.
// Contract: Track ABI v1.1 + ADR-044 discriminator by type + ADR-049 render plan.

export function describe() {
  return {
    id: "data",
    name: "Data Ranking Track",
    description: "数据排名轨道 · 动态排序条形图 · 名次变化动画 · 适合榜单 / 竞赛 / 趋势",
    use_cases: ["排行榜", "竞赛榜单", "趋势对比"],
    viewport: "any",
    t0_visibility: 0.95,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      title: "Track.data params",
      description: "数据表格 Track 参数 · discriminator 字段 type 区分 3 种 variant (继承 ADR-044)",
      type: "object",
      required: ["type"],
      oneOf: [
        {
          title: "ranking variant · 排行榜 Top-N",
          type: "object",
          required: ["type", "rows"],
          additionalProperties: false,
          properties: {
            type: { const: "ranking" },
            rows: {
              type: "array",
              minItems: 1,
              maxItems: 20,
              items: {
                type: "object",
                required: ["label", "value"],
                additionalProperties: false,
                properties: {
                  label: { type: "string", maxLength: 80 },
                  value: { type: "number" },
                  delta: { type: "number", description: "正数涨绿 · 负数跌红 · 省略不显示" }
                }
              }
            },
            highlight_top: { type: "integer", minimum: 0, maximum: 5, default: 3, description: "前 N 名金银铜高亮 · 0 禁用" },
            value_format: { enum: ["integer", "decimal", "percent", "currency"], default: "integer" },
            title: { type: "string", maxLength: 120, description: "可选表格标题" },
            stagger_ms: { type: "number", minimum: 0, maximum: 150, default: 80, description: "行间 stagger ≤ 150 · FM-T0 gate" },
            interpolate_ms: { type: "number", minimum: 100, maximum: 2000, default: 600, description: "数字 0→target 时长 · ease-out" }
          }
        },
        {
          title: "finance variant · 财务/销售多列表",
          type: "object",
          required: ["type", "columns", "rows"],
          additionalProperties: false,
          properties: {
            type: { const: "finance" },
            columns: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: {
                type: "object",
                required: ["key", "label"],
                additionalProperties: false,
                properties: {
                  key: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
                  label: { type: "string", maxLength: 40 }
                }
              }
            },
            rows: {
              type: "array",
              minItems: 1,
              maxItems: 30,
              items: {
                type: "object",
                required: ["label", "cells"],
                additionalProperties: false,
                properties: {
                  label: { type: "string", maxLength: 80 },
                  cells: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["col_key", "value"],
                      additionalProperties: false,
                      properties: {
                        col_key: { type: "string" },
                        value: { type: "number" },
                        trend: { enum: ["up", "down", "flat"], description: "可选 · 视觉箭头" }
                      }
                    }
                  },
                  total_row: { type: "boolean", default: false, description: "true 时加粗 + 紫色 accent" }
                }
              }
            },
            highlight: { enum: ["by_sign", "by_max", "none"], default: "none" },
            value_format: { enum: ["integer", "decimal", "percent", "currency"], default: "integer" },
            title: { type: "string", maxLength: 120 },
            stagger_ms: { type: "number", minimum: 0, maximum: 150, default: 100 },
            interpolate_ms: { type: "number", minimum: 100, maximum: 2000, default: 600 }
          }
        },
        {
          title: "comparison variant · 方案对比表",
          type: "object",
          required: ["type", "options", "criteria"],
          additionalProperties: false,
          properties: {
            type: { const: "comparison" },
            options: {
              type: "array",
              minItems: 2,
              maxItems: 5,
              items: {
                type: "object",
                required: ["key", "label"],
                additionalProperties: false,
                properties: {
                  key: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
                  label: { type: "string", maxLength: 40 }
                }
              }
            },
            criteria: {
              type: "array",
              minItems: 1,
              maxItems: 15,
              items: {
                type: "object",
                required: ["label", "values"],
                additionalProperties: false,
                properties: {
                  label: { type: "string", maxLength: 80 },
                  values: { type: "object", description: "map: option.key → value (string 或 boolean 或 number)" },
                  winner_key: { type: "string", description: "可选 · option.key 高亮紫色描边" }
                }
              }
            },
            title: { type: "string", maxLength: 120 },
            stagger_ms: { type: "number", minimum: 0, maximum: 150, default: 120, description: "列 stagger（非行 stagger · 列逐个入场）" },
            interpolate_ms: { type: "number", minimum: 100, maximum: 2000, default: 400 }
          }
        }
      ]
    }
  };
}

export function sample() {
  return {
    type: "ranking",
    title: "2026 Top 5 Demo",
    rows: [
      { label: "Alpha", value: 1000, delta: 8.2 },
      { label: "Bravo", value: 820, delta: 5.1 },
      { label: "Charlie", value: 640, delta: -2.3 },
      { label: "Delta", value: 510, delta: 12.0 },
      { label: "Echo", value: 380, delta: 3.4 }
    ],
    highlight_top: 3,
    value_format: "integer"
  };
}

const METALS = [
  { edge: "#fbbf24", bg: "linear-gradient(90deg,rgba(251,191,36,0.34),rgba(251,191,36,0.10))" },
  { edge: "#d1d5db", bg: "linear-gradient(90deg,rgba(209,213,219,0.28),rgba(209,213,219,0.08))" },
  { edge: "#d97706", bg: "linear-gradient(90deg,rgba(217,119,6,0.28),rgba(217,119,6,0.08))" },
  { edge: "#f59e0b", bg: "linear-gradient(90deg,rgba(245,158,11,0.18),rgba(245,158,11,0.06))" },
  { edge: "#fb923c", bg: "linear-gradient(90deg,rgba(251,146,60,0.16),rgba(251,146,60,0.05))" }
];

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }

function rowEntryOpacityAt(t, rowIdx, staggerMs, entranceMs) {
  const delay = rowIdx * staggerMs;
  const localT = clamp(t - delay, 0, entranceMs);
  return 0.95 + 0.05 * (localT / entranceMs);
}

function valueInterpolateAt(t, rowIdx, target, staggerMs, interpolateMs) {
  const delay = rowIdx * staggerMs;
  const x = clamp((t - delay) / interpolateMs, 0, 1);
  return target * easeOutCubic(x);
}

function escapeHtml(s) {
  if (typeof s !== "string") return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatValue(v, format) {
  if (format === "percent") return v.toFixed(1) + "%";
  if (format === "currency") {
    const n = Math.round(v);
    return (n < 0 ? "-$" + Math.abs(n).toLocaleString() : "$" + n.toLocaleString());
  }
  if (format === "decimal") return v.toFixed(1);
  return Math.round(v).toLocaleString();
}

function titleHtml(title, vp) {
  if (!title) return "";
  return '<div style="padding:0 0 ' + Math.round(vp.h * 0.018) + 'px 0;font-size:' + Math.round(vp.h * 0.034) + 'px;font-weight:700;letter-spacing:-0.02em;color:#f8fafc;">' + escapeHtml(title) + "</div>";
}

function shellOpen(vp, title) {
  return '<div data-nf-track="data" data-data-title="' + escapeHtml(title || "") + '" style="' +
    "position:absolute;inset:0;" +
    "width:" + vp.w + "px;height:" + vp.h + "px;" +
    "box-sizing:border-box;padding:" + Math.round(vp.h * 0.06) + "px " + Math.round(vp.w * 0.05) + "px;" +
    "background:linear-gradient(180deg,#0f172a,#111827 52%,#0b1120);" +
    "color:#e5eef8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
    "opacity:1.00;overflow:hidden;\">";
}

function trendGlyph(trend) {
  return trend === "up" ? "▲" : trend === "down" ? "▼" : trend === "flat" ? "•" : "";
}

function renderRanking(t, p, vp) {
  const rows = Array.isArray(p.rows) ? p.rows : [];
  const topN = clamp(typeof p.highlight_top === "number" ? p.highlight_top : 3, 0, 5);
  const staggerMs = clamp(typeof p.stagger_ms === "number" ? p.stagger_ms : 80, 0, 150);
  const interpolateMs = clamp(typeof p.interpolate_ms === "number" ? p.interpolate_ms : 600, 100, 2000);
  const valueFormat = p.value_format || "integer";
  const rowGap = Math.max(8, Math.round(vp.h * 0.012));
  const rowH = Math.max(48, Math.round((vp.h * 0.72) / Math.max(rows.length, 5)));
  let out = shellOpen(vp, p.title) + titleHtml(p.title, vp);
  out += '<div style="display:flex;flex-direction:column;gap:' + rowGap + 'px;">';
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const opacity = rowEntryOpacityAt(t, i, staggerMs, 300);
    const metal = i < topN ? METALS[i] || METALS[METALS.length - 1] : null;
    const currentValue = valueInterpolateAt(t, i, typeof row.value === "number" ? row.value : 0, staggerMs, interpolateMs);
    const delta = typeof row.delta === "number" ? row.delta : null;
    const deltaColor = delta === null ? "#94a3b8" : delta >= 0 ? "#34d399" : "#f87171";
    const deltaText = delta === null ? "" : (delta > 0 ? "+" : "") + delta.toFixed(1) + "%";
    out += '<div data-variant="ranking-row" style="' +
      "display:grid;grid-template-columns:" + Math.round(vp.w * 0.08) + "px 1fr " + Math.round(vp.w * 0.18) + "px " + Math.round(vp.w * 0.12) + "px;" +
      "align-items:center;min-height:" + rowH + "px;padding:0 " + Math.round(vp.w * 0.02) + "px;" +
      "border-radius:" + Math.round(vp.h * 0.015) + "px;border:1px solid rgba(148,163,184,0.12);" +
      "box-shadow:" + (metal ? "inset 6px 0 0 " + metal.edge : "inset 0 0 0 transparent") + ";" +
      "background:" + (metal ? metal.bg : "rgba(15,23,42,0.62)") + ";" +
      "opacity:" + opacity.toFixed(2) + ';">' +
      '<div style="font-size:' + Math.round(vp.h * 0.026) + 'px;font-weight:800;color:' + (metal ? metal.edge : "#94a3b8") + ';">' + (i + 1) + "</div>" +
      '<div style="font-size:' + Math.round(vp.h * 0.028) + 'px;font-weight:600;color:#f8fafc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:12px;">' + escapeHtml(row.label || "") + "</div>" +
      '<div style="font-size:' + Math.round(vp.h * 0.032) + 'px;font-weight:700;text-align:right;color:#f8fafc;">' + formatValue(currentValue, valueFormat) + "</div>" +
      '<div style="font-size:' + Math.round(vp.h * 0.022) + 'px;font-weight:700;text-align:right;color:' + deltaColor + ';">' + escapeHtml(deltaText) + "</div>" +
    "</div>";
  }
  return out + "</div></div>";
}

function renderFinance(t, p, vp) {
  const columns = Array.isArray(p.columns) ? p.columns : [];
  const rows = Array.isArray(p.rows) ? p.rows : [];
  const valueFormat = p.value_format || "integer";
  const highlight = p.highlight || "none";
  const staggerMs = clamp(typeof p.stagger_ms === "number" ? p.stagger_ms : 100, 0, 150);
  const interpolateMs = clamp(typeof p.interpolate_ms === "number" ? p.interpolate_ms : 600, 100, 2000);
  const labelW = Math.round(vp.w * 0.2);
  const tableW = vp.w - Math.round(vp.w * 0.1);
  const cellW = Math.max(90, Math.floor((tableW - labelW) / Math.max(columns.length, 1)));
  const font = Math.round(vp.h * 0.022);
  let out = shellOpen(vp, p.title) + titleHtml(p.title, vp);
  out += '<div style="border:1px solid rgba(148,163,184,0.16);border-radius:' + Math.round(vp.h * 0.018) + 'px;overflow:hidden;background:rgba(15,23,42,0.58);">';
  out += '<div style="display:grid;grid-template-columns:' + labelW + "px repeat(" + Math.max(columns.length, 1) + "," + cellW + 'px);background:rgba(30,41,59,0.88);opacity:0.98;">';
  out += '<div style="padding:' + Math.round(vp.h * 0.018) + 'px ' + Math.round(vp.w * 0.012) + 'px;font-size:' + font + 'px;font-weight:700;color:#cbd5e1;">Metric</div>';
  for (let c = 0; c < columns.length; c++) {
    out += '<div style="padding:' + Math.round(vp.h * 0.018) + 'px ' + Math.round(vp.w * 0.012) + 'px;font-size:' + font + 'px;font-weight:700;color:#e2e8f0;text-align:right;">' + escapeHtml(columns[c].label || "") + "</div>";
  }
  out += "</div>";
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || {};
    const opacity = rowEntryOpacityAt(t, i, staggerMs, 300);
    const cells = Array.isArray(row.cells) ? row.cells : [];
    let rowMax = -Infinity;
    for (let j = 0; j < cells.length; j++) if (typeof cells[j].value === "number" && cells[j].value > rowMax) rowMax = cells[j].value;
    out += '<div data-variant="finance-row" style="display:grid;grid-template-columns:' + labelW + "px repeat(" + Math.max(columns.length, 1) + "," + cellW + 'px);border-top:1px solid rgba(148,163,184,0.10);background:' + (row.total_row ? "rgba(167,139,250,0.12)" : "transparent") + ';opacity:' + opacity.toFixed(2) + ';">';
    out += '<div style="padding:' + Math.round(vp.h * 0.016) + 'px ' + Math.round(vp.w * 0.012) + 'px;font-size:' + font + 'px;font-weight:' + (row.total_row ? "800" : "600") + ';color:#f8fafc;">' + escapeHtml(row.label || "") + "</div>";
    for (let c = 0; c < columns.length; c++) {
      const col = columns[c] || {};
      let cell = null;
      for (let j = 0; j < cells.length; j++) if (cells[j] && cells[j].col_key === col.key) { cell = cells[j]; break; }
      const target = cell && typeof cell.value === "number" ? cell.value : 0;
      const currentValue = valueInterpolateAt(t, i, target, staggerMs, interpolateMs);
      const bySign = highlight === "by_sign";
      const byMax = highlight === "by_max" && target === rowMax && rowMax !== -Infinity;
      const textColor = bySign ? (target > 0 ? "#34d399" : target < 0 ? "#f87171" : "#e5e7eb") : "#f8fafc";
      const bg = bySign ? (target > 0 ? "rgba(52,211,153,0.10)" : target < 0 ? "rgba(248,113,113,0.10)" : "transparent") : "transparent";
      const accent = row.total_row ? "box-shadow:inset 0 0 0 999px rgba(255,255,255,0.01);" : "";
      out += '<div style="padding:' + Math.round(vp.h * 0.016) + 'px ' + Math.round(vp.w * 0.012) + 'px;font-size:' + font + 'px;text-align:right;color:' + textColor + ';font-weight:' + (row.total_row || byMax ? "800" : "600") + ';background:' + bg + ';' + accent + (byMax ? "outline:2px solid rgba(248,250,252,0.30);outline-offset:-2px;" : "") + '">' +
        '<span>' + formatValue(currentValue, valueFormat) + "</span>" +
        (cell && cell.trend ? '<span style="padding-left:8px;color:#94a3b8;">' + trendGlyph(cell.trend) + "</span>" : "") +
      "</div>";
    }
    out += "</div>";
  }
  return out + "</div></div>";
}

function comparisonCellHtml(t, colIdx, value, winner, vp, staggerMs, interpolateMs) {
  const opacity = rowEntryOpacityAt(t, colIdx, staggerMs, 300);
  const border = winner ? "2px solid #a78bfa" : "1px solid rgba(148,163,184,0.10)";
  let text = "";
  let color = "#f8fafc";
  let weight = "600";
  if (value === true) {
    text = "✓";
    color = "#34d399";
    weight = "800";
  } else if (value === false) {
    text = "✗";
    color = "#64748b";
  } else if (typeof value === "number") {
    text = formatValue(valueInterpolateAt(t, colIdx, value, staggerMs, interpolateMs), Math.round(value) === value ? "integer" : "decimal");
    color = "#e2e8f0";
    weight = "700";
  } else {
    text = escapeHtml(value == null ? "" : String(value));
  }
  return '<div style="padding:' + Math.round(vp.h * 0.018) + 'px ' + Math.round(vp.w * 0.01) + 'px;text-align:center;font-size:' + Math.round(vp.h * 0.022) + 'px;font-weight:' + weight + ';color:' + color + ';border-left:' + border + ';opacity:' + opacity.toFixed(2) + ';">' + text + "</div>";
}

function renderComparison(t, p, vp) {
  const options = Array.isArray(p.options) ? p.options : [];
  const criteria = Array.isArray(p.criteria) ? p.criteria : [];
  const staggerMs = clamp(typeof p.stagger_ms === "number" ? p.stagger_ms : 120, 0, 150);
  const interpolateMs = clamp(typeof p.interpolate_ms === "number" ? p.interpolate_ms : 400, 100, 2000);
  const labelW = Math.round(vp.w * 0.22);
  const tableW = vp.w - Math.round(vp.w * 0.1);
  const cellW = Math.max(120, Math.floor((tableW - labelW) / Math.max(options.length, 1)));
  let out = shellOpen(vp, p.title) + titleHtml(p.title, vp);
  out += '<div style="border:1px solid rgba(148,163,184,0.16);border-radius:' + Math.round(vp.h * 0.018) + 'px;overflow:hidden;background:rgba(15,23,42,0.56);">';
  out += '<div style="display:grid;grid-template-columns:' + labelW + "px repeat(" + Math.max(options.length, 1) + "," + cellW + 'px);background:rgba(30,41,59,0.92);">';
  out += '<div style="padding:' + Math.round(vp.h * 0.02) + 'px ' + Math.round(vp.w * 0.012) + 'px;font-size:' + Math.round(vp.h * 0.022) + 'px;font-weight:700;color:#cbd5e1;">Criteria</div>';
  for (let c = 0; c < options.length; c++) {
    const opacity = rowEntryOpacityAt(t, c, staggerMs, 300);
    out += '<div style="padding:' + Math.round(vp.h * 0.02) + 'px ' + Math.round(vp.w * 0.01) + 'px;text-align:center;font-size:' + Math.round(vp.h * 0.023) + 'px;font-weight:800;color:#f8fafc;opacity:' + opacity.toFixed(2) + ';">' + escapeHtml(options[c].label || "") + "</div>";
  }
  out += "</div>";
  for (let i = 0; i < criteria.length; i++) {
    const item = criteria[i] || {};
    const values = item.values || {};
    out += '<div data-variant="comparison-row" style="display:grid;grid-template-columns:' + labelW + "px repeat(" + Math.max(options.length, 1) + "," + cellW + 'px);border-top:1px solid rgba(148,163,184,0.10);">';
    out += '<div style="padding:' + Math.round(vp.h * 0.018) + 'px ' + Math.round(vp.w * 0.012) + 'px;font-size:' + Math.round(vp.h * 0.022) + 'px;font-weight:600;color:#f8fafc;opacity:0.98;">' + escapeHtml(item.label || "") + "</div>";
    for (let c = 0; c < options.length; c++) {
      const option = options[c] || {};
      out += comparisonCellHtml(t, c, values[option.key], item.winner_key === option.key, vp, staggerMs, interpolateMs);
    }
    out += "</div>";
  }
  return out + "</div></div>";
}

export function render(t, params, viewport) {
  const p = params || {};
  const vp = viewport && typeof viewport.w === "number" && typeof viewport.h === "number" ? viewport : { w: 1920, h: 1080 };
  switch (p.type) {
    case "finance":
      return renderFinance(t, p, vp);
    case "comparison":
      return renderComparison(t, p, vp);
    case "ranking":
    default:
      return renderRanking(t, p, vp);
  }
}
