// src/nf-tracks/official/chart.js
// Official "chart" Track — bar / line / pie with multi-series support.
// Contract: ADR-033 Track ABI v1.1 + ADR-048 inline SVG + t 纯驱动 + FM-T0 gate.
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs):
//   - single-file, zero imports (no import / require / await import)
//   - three and only three exports: describe, sample, render
//   - render is a PURE function of (t, params, viewport)
//   - render(0, sample(), vp) main <div data-track="chart"> opacity >= 0.9
//   - all floats via .toFixed(2) or .toFixed(3) to avoid binary drift
//
// Allowed globals: Math, JSON, Array, Object, String, Number. NO Date.now,
// NO Math.random, NO DOM, NO fetch, NO performance.now — use `t` for time.

// ---------- 1. Describe (schema contract — mirrors spec/interfaces.json) ----

export function describe() {
  return {
    id: "chart",
    name: "Chart Track",
    viewport: "any",
    // FM-T0 gate: t=0 container opacity must be >= 0.9. Target 0.95.
    t0_visibility: 0.95,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["chart_type", "series"],
      additionalProperties: false,
      properties: {
        chart_type: {
          type: "string",
          enum: ["bar", "line", "pie"],
          description: "图表类型",
        },
        layout: {
          type: "string",
          enum: ["grouped", "stacked", "default"],
          default: "grouped",
          description: "仅 bar 用 · grouped 并列 · stacked 堆叠",
        },
        title: { type: "string", maxLength: 200 },
        categories: {
          type: "array",
          items: { type: "string", maxLength: 50 },
          maxItems: 20,
          description: "X 轴类别（bar/line 必需）· pie 忽略此字段改用 series[i].name",
        },
        series: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            required: ["name"],
            additionalProperties: false,
            properties: {
              name: { type: "string", maxLength: 50 },
              color: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
              data: {
                type: "array",
                items: { type: "number" },
                description: "bar/line 用数组（长度应等于 categories.length）",
              },
              value: {
                type: "number",
                minimum: 0,
                description: "pie 单系列的数值（百分比或绝对值均可，自动归一化）",
              },
            },
          },
        },
        animation: {
          type: "object",
          additionalProperties: false,
          properties: {
            duration_ms: { type: "integer", minimum: 0, maximum: 10000, default: 1500 },
            stagger_ms: {
              type: "integer",
              minimum: 0,
              maximum: 2000,
              default: 80,
              description: "bar/line 每系列/点的入场错峰",
            },
            mode: {
              type: "string",
              enum: ["sweep", "rise", "reveal", "default"],
              default: "default",
              description: "sweep 仅 pie · rise 仅 bar · reveal 仅 line · default 按 chart_type 挑默认",
            },
          },
        },
        y_axis_max: {
          type: "number",
          description: "可选 · 未提供则取 max(all data) * 1.1",
        },
        bg_color: {
          type: "string",
          pattern: "^#[0-9a-fA-F]{6}$",
          default: "#0a0a0f",
        },
      },
    },
  };
}

// ---------- 2. Sample (default params — mirrors interfaces.json sample_return) ----

export function sample() {
  return {
    chart_type: "bar",
    layout: "grouped",
    categories: ["Q1", "Q2", "Q3", "Q4"],
    series: [
      { name: "2024", color: "#a78bfa", data: [45, 55, 50, 62] },
      { name: "2025", color: "#f97316", data: [58, 68, 65, 78] },
      { name: "2026", color: "#34d399", data: [72, 82, 88, 95] },
    ],
    animation: { duration_ms: 1500, stagger_ms: 80, mode: "rise" },
    title: "季度销售额（万元）",
  };
}

// ---------- 3. Helpers (in-file; zero import rule forbids extraction) ------

const PALETTE = [
  "#a78bfa", "#f97316", "#34d399", "#38bdf8",
  "#fbbf24", "#f472b6", "#67e8f9", "#f87171",
];

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// Container opacity: 0.95 at t=0 ramping to 1.0 by t=300ms. FM-T0 passes.
function entryOpacityAt(t) {
  return 0.95 + 0.05 * clamp(t / 300, 0, 1);
}

function colorFor(series, i) {
  const c = series && typeof series.color === "string" ? series.color : "";
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : PALETTE[i % PALETTE.length];
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

// Euclidean polyline length (offline) — used by line chart dash reveal.
function pathLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    L += Math.sqrt(dx * dx + dy * dy);
  }
  return L;
}

// polar (cx,cy,r,deg) where 0deg = 12 o'clock, sweeping clockwise.
function polarPt(cx, cy, r, deg) {
  const a = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

// Annular wedge path string. Returns "" if span too small.
function wedgePath(cx, cy, rOuter, rInner, angStart, angEnd) {
  if (angEnd - angStart < 0.001) return "";
  const p1 = polarPt(cx, cy, rOuter, angStart);
  const p2 = polarPt(cx, cy, rOuter, angEnd);
  const p3 = polarPt(cx, cy, rInner, angEnd);
  const p4 = polarPt(cx, cy, rInner, angStart);
  const large = (angEnd - angStart) > 180 ? 1 : 0;
  return "M" + p1[0].toFixed(2) + "," + p1[1].toFixed(2) +
         " A" + rOuter.toFixed(2) + "," + rOuter.toFixed(2) + " 0 " + large + " 1 " +
         p2[0].toFixed(2) + "," + p2[1].toFixed(2) +
         " L" + p3[0].toFixed(2) + "," + p3[1].toFixed(2) +
         " A" + rInner.toFixed(2) + "," + rInner.toFixed(2) + " 0 " + large + " 0 " +
         p4[0].toFixed(2) + "," + p4[1].toFixed(2) +
         " Z";
}

function resolveAnimation(p) {
  const a = (p && p.animation) || {};
  const dur = (typeof a.duration_ms === "number" && a.duration_ms > 0) ? a.duration_ms : 1500;
  const stag = (typeof a.stagger_ms === "number" && a.stagger_ms >= 0) ? a.stagger_ms : 80;
  return { dur: dur, stag: stag };
}

// ---------- 4. Render branches --------------------------------------------

function renderBar(t, p, vp) {
  const W = vp.w, H = vp.h;
  const anim = resolveAnimation(p);
  const cats = Array.isArray(p.categories) ? p.categories : [];
  const series = Array.isArray(p.series) ? p.series : [];
  const nCats = cats.length || 1;
  const nSer = series.length || 1;
  const stacked = p.layout === "stacked";

  // compute axis max
  let maxV = 0;
  if (stacked) {
    for (let g = 0; g < nCats; g++) {
      let sum = 0;
      for (let s = 0; s < nSer; s++) {
        const d = (series[s].data || [])[g];
        if (typeof d === "number") sum += d;
      }
      if (sum > maxV) maxV = sum;
    }
  } else {
    for (let s = 0; s < nSer; s++) {
      const data = series[s].data || [];
      for (let j = 0; j < data.length; j++) {
        if (data[j] > maxV) maxV = data[j];
      }
    }
  }
  const axisMax = typeof p.y_axis_max === "number" && p.y_axis_max > 0
    ? p.y_axis_max
    : (maxV > 0 ? Math.ceil(maxV * 1.1 / 25) * 25 || Math.ceil(maxV * 1.1) : 100);

  const padL = Math.round(W * 0.04);
  const padR = Math.round(W * 0.02);
  const padT = Math.round(H * 0.14);
  const padB = Math.round(H * 0.12);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const groupW = plotW / nCats;
  const barW = stacked
    ? Math.max(8, groupW * 0.55)
    : Math.max(4, groupW / (nSer + 0.5) * 0.78);
  const gap = stacked ? 0 : Math.max(2, groupW / (nSer + 0.5) * 0.12);
  const totalBarsW = stacked ? barW : nSer * barW + (nSer - 1) * gap;

  let out = '<svg data-chart="bar-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="position:absolute;inset:0;">';

  // Y gridlines + labels (5 steps: 0, 25%, 50%, 75%, 100%)
  const steps = 4;
  for (let k = 0; k <= steps; k++) {
    const y = padT + plotH * (1 - k / steps);
    const v = Math.round(axisMax * k / steps);
    out += '<text x="' + (padL - 10) + '" y="' + (y + 4).toFixed(2) + '" fill="rgba(255,255,255,0.40)" font-size="' + Math.round(H * 0.012) + '" text-anchor="end" font-family="SF Mono,monospace">' + v + '</text>';
    out += '<line x1="' + padL + '" y1="' + y.toFixed(2) + '" x2="' + (padL + plotW).toFixed(2) + '" y2="' + y.toFixed(2) + '" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>';
  }

  // Bars — pure-t driven stagger
  for (let g = 0; g < nCats; g++) {
    const cx = padL + g * groupW + groupW / 2;
    const bx0 = cx - totalBarsW / 2;
    let stackBaseY = padT + plotH;
    for (let s = 0; s < nSer; s++) {
      const data = series[s].data || [];
      const target = typeof data[g] === "number" ? data[g] : 0;
      const targetPx = plotH * (target / axisMax);
      const barIndex = g * nSer + s;
      const localT = t - barIndex * anim.stag;
      const frac = clamp(localT / anim.dur, 0, 1);
      const hPx = targetPx * frac;
      const col = colorFor(series[s], s);
      let x, y;
      if (stacked) {
        x = cx - barW / 2;
        y = stackBaseY - hPx;
        stackBaseY -= hPx;
      } else {
        x = bx0 + s * (barW + gap);
        y = padT + plotH - hPx;
      }
      out += '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + barW.toFixed(2) + '" height="' + hPx.toFixed(2) + '" rx="3" ry="3" fill="' + col + '"/>';
    }
    // category label
    const lbl = typeof cats[g] === "string" ? cats[g] : "";
    out += '<text x="' + cx.toFixed(2) + '" y="' + (padT + plotH + Math.round(H * 0.03)) + '" fill="rgba(255,255,255,0.70)" font-size="' + Math.round(H * 0.014) + '" font-weight="600" text-anchor="middle">' + escapeHtml(lbl) + '</text>';
  }

  // Legend (bottom-left)
  let legX = padL;
  const legY = H - Math.round(H * 0.04);
  const legStep = Math.round(W * 0.05);
  for (let li = 0; li < nSer; li++) {
    const col = colorFor(series[li], li);
    out += '<rect x="' + legX + '" y="' + (legY - 9) + '" width="10" height="10" rx="2" ry="2" fill="' + col + '"/>';
    out += '<text x="' + (legX + 16) + '" y="' + legY + '" fill="rgba(255,255,255,0.60)" font-size="' + Math.round(H * 0.012) + '">' + escapeHtml(series[li].name || "") + '</text>';
    legX += legStep;
  }

  out += '</svg>';
  return out;
}

function renderLine(t, p, vp) {
  const W = vp.w, H = vp.h;
  const anim = resolveAnimation(p);
  const cats = Array.isArray(p.categories) ? p.categories : [];
  const series = Array.isArray(p.series) ? p.series : [];
  const nSer = series.length || 1;
  const nPts = cats.length || ((series[0] && series[0].data && series[0].data.length) || 1);

  // axis max
  let maxV = 0;
  for (let s = 0; s < nSer; s++) {
    const data = series[s].data || [];
    for (let j = 0; j < data.length; j++) {
      if (data[j] > maxV) maxV = data[j];
    }
  }
  const axisMax = typeof p.y_axis_max === "number" && p.y_axis_max > 0
    ? p.y_axis_max
    : (maxV > 0 ? Math.ceil(maxV * 1.1 / 25) * 25 || Math.ceil(maxV * 1.1) : 100);

  const padL = Math.round(W * 0.04);
  const padR = Math.round(W * 0.02);
  const padT = Math.round(H * 0.14);
  const padB = Math.round(H * 0.12);
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let out = '<svg data-chart="line-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="position:absolute;inset:0;">';

  // Y gridlines + labels
  const steps = 4;
  for (let k = 0; k <= steps; k++) {
    const gy = padT + plotH * (1 - k / steps);
    const gv = Math.round(axisMax * k / steps);
    out += '<text x="' + (padL - 10) + '" y="' + (gy + 4).toFixed(2) + '" fill="rgba(255,255,255,0.40)" font-size="' + Math.round(H * 0.012) + '" text-anchor="end" font-family="SF Mono,monospace">' + gv + '</text>';
    out += '<line x1="' + padL + '" y1="' + gy.toFixed(2) + '" x2="' + (padL + plotW).toFixed(2) + '" y2="' + gy.toFixed(2) + '" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>';
  }

  // X-axis category labels
  const denom = Math.max(1, nPts - 1);
  for (let mi = 0; mi < nPts; mi++) {
    const mx = padL + (mi / denom) * plotW;
    const lbl = typeof cats[mi] === "string" ? cats[mi] : "";
    out += '<text x="' + mx.toFixed(2) + '" y="' + (padT + plotH + Math.round(H * 0.028)) + '" fill="rgba(255,255,255,0.60)" font-size="' + Math.round(H * 0.012) + '" text-anchor="middle">' + escapeHtml(lbl) + '</text>';
  }

  // Lines with stroke-dasharray reveal
  for (let si = 0; si < nSer; si++) {
    const ser = series[si];
    const data = ser.data || [];
    const col = colorFor(ser, si);
    const pts = [];
    const nd = data.length;
    const dDenom = Math.max(1, nd - 1);
    for (let j = 0; j < nd; j++) {
      const x = padL + (j / dDenom) * plotW;
      const y = padT + plotH * (1 - data[j] / axisMax);
      pts.push([x, y]);
    }
    if (pts.length < 2) continue;

    let d = "M" + pts[0][0].toFixed(2) + "," + pts[0][1].toFixed(2);
    for (let k2 = 1; k2 < pts.length; k2++) {
      d += " L" + pts[k2][0].toFixed(2) + "," + pts[k2][1].toFixed(2);
    }
    const L = pathLen(pts);
    const localT = t - si * anim.stag;
    const frac = clamp(localT / anim.dur, 0, 1);
    const offsetLen = L * (1 - frac);

    out += '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="' + L.toFixed(2) + '" stroke-dashoffset="' + offsetLen.toFixed(2) + '"/>';

    // End-dot appears when line fully drawn
    if (frac >= 0.999) {
      const last = pts[pts.length - 1];
      out += '<circle cx="' + last[0].toFixed(2) + '" cy="' + last[1].toFixed(2) + '" r="4" fill="' + col + '"/>';
    }
  }

  // Legend
  let legX = padL;
  const legY = H - Math.round(H * 0.04);
  const legStep = Math.round(W * 0.05);
  for (let li = 0; li < nSer; li++) {
    const col = colorFor(series[li], li);
    out += '<rect x="' + legX + '" y="' + (legY - 9) + '" width="10" height="10" rx="2" ry="2" fill="' + col + '"/>';
    out += '<text x="' + (legX + 16) + '" y="' + legY + '" fill="rgba(255,255,255,0.60)" font-size="' + Math.round(H * 0.012) + '">' + escapeHtml(series[li].name || "") + '</text>';
    legX += legStep;
  }

  out += '</svg>';
  return out;
}

function renderPie(t, p, vp) {
  const W = vp.w, H = vp.h;
  const anim = resolveAnimation(p);
  const series = Array.isArray(p.series) ? p.series : [];
  const nSer = series.length || 1;

  let total = 0;
  for (let i = 0; i < nSer; i++) {
    const v = series[i] && typeof series[i].value === "number" ? series[i].value : 0;
    if (v > 0) total += v;
  }
  if (total <= 0) total = 1;

  const pieR = Math.min(H, W) * 0.32;
  const pieInner = pieR * 0.55;
  const cx = W * 0.30;
  const cy = H * 0.55;

  let out = '<svg data-chart="pie-arc" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" style="position:absolute;inset:0;">';

  // Per-slice sweep with stagger (each slice gets its own fraction).
  // Slice i animates from [i*stagger, i*stagger + dur].
  let cursor = 0;
  for (let si = 0; si < nSer; si++) {
    const v = series[si] && typeof series[si].value === "number" ? series[si].value : 0;
    const sliceDeg = 360 * v / total;
    const localT = t - si * anim.stag;
    const frac = clamp(localT / anim.dur, 0, 1);
    const visEnd = cursor + sliceDeg * frac;
    if (visEnd > cursor + 0.001) {
      const col = colorFor(series[si], si);
      const d = wedgePath(cx, cy, pieR, pieInner, cursor, visEnd);
      if (d) {
        out += '<path d="' + d + '" fill="' + col + '" stroke="#0a0a0f" stroke-width="1.5"/>';
      }
    }
    cursor += sliceDeg;
  }

  // Right-side legend (series name + percentage)
  const legX = W * 0.58;
  let legY = H * 0.28;
  const legStep = Math.round(H * 0.06);
  for (let li = 0; li < nSer; li++) {
    const v = series[li] && typeof series[li].value === "number" ? series[li].value : 0;
    const pct = Math.round(100 * v / total);
    const col = colorFor(series[li], li);
    out += '<rect x="' + legX.toFixed(2) + '" y="' + (legY - 9).toFixed(2) + '" width="14" height="14" rx="2" ry="2" fill="' + col + '"/>';
    out += '<text x="' + (legX + 22).toFixed(2) + '" y="' + legY.toFixed(2) + '" fill="rgba(255,255,255,0.85)" font-size="' + Math.round(H * 0.018) + '">' + escapeHtml(series[li].name || "") + ' · ' + pct + '%</text>';
    legY += legStep;
  }

  out += '</svg>';
  return out;
}

// ---------- 5. Main render (container + dispatch) --------------------------

export function render(t, params, viewport) {
  const p = params || {};
  const vp = (viewport && typeof viewport.w === "number" && typeof viewport.h === "number")
    ? viewport
    : { w: 1920, h: 1080 };
  const opacity = entryOpacityAt(t);
  const bg = /^#[0-9a-fA-F]{6}$/.test(p.bg_color || "") ? p.bg_color : "#0a0a0f";
  const chartType = (p.chart_type === "bar" || p.chart_type === "line" || p.chart_type === "pie")
    ? p.chart_type : "bar";

  let inner = "";
  if (chartType === "line") inner = renderLine(t, p, vp);
  else if (chartType === "pie") inner = renderPie(t, p, vp);
  else inner = renderBar(t, p, vp);

  const titleSize = Math.round(vp.h * 0.028);
  const titleTop = Math.round(vp.h * 0.04);
  const titleLeft = Math.round(vp.w * 0.04);
  const titleHtml = (typeof p.title === "string" && p.title.length > 0)
    ? '<div style="position:absolute;top:' + titleTop + 'px;left:' + titleLeft + 'px;font-size:' + titleSize + 'px;font-weight:700;color:#f0f6fc;letter-spacing:-0.01em;">' + escapeHtml(p.title) + '</div>'
    : "";

  return (
    '<div data-track="chart" data-chart-type="' + chartType + '" style="' +
      'position:absolute;inset:0;' +
      'width:' + vp.w + 'px;height:' + vp.h + 'px;' +
      'background:' + bg + ';' +
      'color:#f0f6fc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
      'opacity:' + opacity.toFixed(2) + ';' +
    '">' +
      titleHtml +
      inner +
    '</div>'
  );
}
