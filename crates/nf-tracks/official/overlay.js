// src/nf-tracks/official/overlay.js
// Official "overlay" Track — badges and progress UI for multi-track exports.

export function describe() {
  return {
    id: "overlay",
    kind: "overlay",
    name: "Overlay Track",
    description: "叠加轨道 · 角标 / 进度条 / 状态胶囊",
    use_cases: ["品牌角标", "进度条", "状态标签"],
    viewport: "any",
    t0_visibility: 1.0,
    z_order_hint: 30,
    visual_channels: ["overlay"],
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["variant"],
      additionalProperties: false,
      properties: {
        variant: { type: "string", enum: ["badge", "progress"] },
        text: { type: "string", maxLength: 120 },
        progress: { type: "number", minimum: 0, maximum: 1 },
        x: { type: "number", minimum: 0, maximum: 100 },
        y: { type: "number", minimum: 0, maximum: 100 },
        accent_color: { type: "string" },
      },
    },
  };
}

export function sample() {
  return {
    variant: "badge",
    text: "NEXTFRAME",
    x: 8,
    y: 8,
    accent_color: "#5eead4",
  };
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

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function isHex6(s) {
  return /^#[0-9a-fA-F]{6}$/.test(s || "");
}

function accent(value) {
  return isHex6(value) ? value : "#5eead4";
}

function renderBadge(p) {
  const color = accent(p.accent_color);
  const text = escapeHtml(p.text || "NEXTFRAME");
  const x = clamp(typeof p.x === "number" ? p.x : 8, 2, 98);
  const y = clamp(typeof p.y === "number" ? p.y : 8, 2, 98);
  return (
    '<div data-layout="overlay-badge" data-nf-track="overlay" style="' +
      'position:absolute !important;left:' + x.toFixed(2) + '% !important;top:' + y.toFixed(2) + '% !important;' +
      'width:auto !important;height:auto !important;transform:none !important;z-index:30;pointer-events:none;' +
      'display:inline-flex;align-items:center;gap:10px;padding:12px 15px;' +
      'border:1px solid rgba(255,255,255,0.16);background:rgba(7,8,13,0.62);' +
      "font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;" +
      'font-size:18px;font-weight:760;line-height:1;color:#f7f4ed;letter-spacing:0.12em;text-transform:uppercase;' +
    '">' +
      '<span style="width:8px;height:8px;background:' + color + ';display:inline-block;"></span>' + text +
    '</div>'
  );
}

function renderProgress(p) {
  const color = accent(p.accent_color);
  const progress = clamp(typeof p.progress === "number" ? p.progress : 0.5, 0, 1);
  const text = escapeHtml(p.text || "");
  return (
    '<div data-layout="overlay-progress" data-nf-track="overlay" style="' +
      'position:absolute !important;left:64px !important;right:64px !important;bottom:52px !important;top:auto !important;' +
      'width:auto !important;height:auto !important;transform:none !important;z-index:30;pointer-events:none;' +
      "font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;" +
    '">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:13px;font-size:17px;font-weight:680;color:rgba(247,244,237,0.62);letter-spacing:0.08em;text-transform:uppercase;">' +
        '<span>' + text + '</span><span>' + Math.round(progress * 100) + '%</span>' +
      '</div>' +
      '<div style="height:4px;background:rgba(255,255,255,0.12);overflow:hidden;">' +
        '<div style="height:100%;width:' + (progress * 100).toFixed(2) + '%;background:' + color + ';"></div>' +
      '</div>' +
    '</div>'
  );
}

export function render(t, params, viewport) {
  const p = params || {};
  const _vp = viewport && typeof viewport.w === "number" ? viewport.w : 1920;
  const _t = typeof t === "number" ? t : 0;
  if (_vp < 0 || _t < -1) return "";
  if (p.variant === "progress") return renderProgress(p);
  return renderBadge(p);
}
