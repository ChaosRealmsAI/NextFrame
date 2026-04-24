// src/nf-tracks/official/text.js
// Official "text" Track — independent text overlays for multi-track exports.

export function describe() {
  return {
    id: "text",
    kind: "text",
    name: "Text Track",
    description: "文字轨道 · 独立叠加在 scene 上方 · 支持位置 / 尺寸 / 色彩",
    use_cases: ["字幕", "标题补充", "说明文字"],
    viewport: "any",
    t0_visibility: 1.0,
    z_order_hint: 20,
    visual_channels: ["text"],
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["text"],
      additionalProperties: false,
      properties: {
        text: { type: "string", maxLength: 260 },
        style: { type: "string", enum: ["caption", "label", "headline"] },
        x: { type: "number", minimum: 0, maximum: 100 },
        y: { type: "number", minimum: 0, maximum: 100 },
        size_px: { type: "number", minimum: 8 },
        color: { type: "string" },
        accent_color: { type: "string" },
        align: { type: "string", enum: ["left", "center", "right"] },
      },
    },
  };
}

export function sample() {
  return {
    text: "Live text track",
    style: "caption",
    x: 50,
    y: 82,
    size_px: 34,
    color: "#f7f4ed",
    accent_color: "#5eead4",
    align: "center",
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

function color(value, fallback) {
  return isHex6(value) ? value : fallback;
}

function opacityAt(t) {
  const frac = clamp(t / 220, 0, 1);
  return 0.92 + 0.08 * frac;
}

export function render(t, params, viewport) {
  const p = params || {};
  const vp =
    viewport && typeof viewport.w === "number" && typeof viewport.h === "number"
      ? viewport
      : { w: 1920, h: 1080 };
  const text = escapeHtml(p.text || "");
  if (!text) return '<div data-layout="text-empty" style="opacity:0.95;"></div>';

  const style = p.style === "headline" || p.style === "label" ? p.style : "caption";
  const x = clamp(typeof p.x === "number" ? p.x : 50, 4, 96);
  const y = clamp(typeof p.y === "number" ? p.y : 82, 4, 96);
  const align = p.align === "left" || p.align === "right" ? p.align : "center";
  const baseSize = style === "headline" ? 56 : style === "label" ? 24 : 34;
  const size = typeof p.size_px === "number" && p.size_px >= 8 ? p.size_px : baseSize;
  const fg = color(p.color, "#f7f4ed");
  const accent = color(p.accent_color, "#5eead4");
  const opacity = opacityAt(typeof t === "number" ? t : 0);
  const width = style === "headline" ? Math.round(vp.w * 0.58) : Math.round(vp.w * 0.64);
  const translateX = align === "left" ? "0" : align === "right" ? "-100%" : "-50%";

  const box =
    style === "label"
      ? "display:inline-flex;align-items:center;gap:12px;padding:10px 14px;border:1px solid rgba(255,255,255,0.16);background:rgba(7,8,13,0.62);"
      : "display:block;padding:0;";
  const marker =
    style === "label"
      ? '<span style="width:8px;height:8px;background:' + accent + ';display:inline-block;"></span>'
      : "";

  return (
    '<div data-layout="text" data-nf-track="text" style="' +
      'position:absolute !important;left:' + x.toFixed(2) + '% !important;top:' + y.toFixed(2) + '% !important;' +
      'width:' + width + 'px !important;height:auto !important;transform:translate(' + translateX + ',-50%) !important;' +
      'z-index:20;pointer-events:none;opacity:' + opacity.toFixed(2) + ';text-align:' + align + ';' +
      "font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;" +
    '">' +
      '<div style="' + box + 'font-size:' + size + 'px;line-height:1.22;font-weight:' + (style === "headline" ? "760" : "580") + ';letter-spacing:0;color:' + fg + ';text-shadow:0 14px 44px rgba(0,0,0,0.62);">' +
        marker + '<span>' + text + '</span>' +
      '</div>' +
    '</div>'
  );
}
