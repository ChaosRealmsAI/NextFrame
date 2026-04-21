// src/nf-tracks/official/scene.js
// Official "scene" Track — hero / stat card layouts.
// Contract: ADR-033 Track ABI v1.1 + ADR-024 底契约 + FM-T0 gate (ADR-027).
//
// HARD CONSTRAINTS (lint-enforced by scripts/check-abi.mjs):
//   - single-file, zero imports, zero require, zero await import
//   - three and only three exports: describe, sample, render
//   - render is a PURE function of (t, params, viewport)
//   - render(0, sample(), viewport) → HTML containing opacity >= 0.9
//
// Allowed globals: Math, JSON, Array, Object, String, Number (no Date.now, no
// random, no DOM, no fetch). Use `t` for all time-dependent behaviour.

export function describe() {
  return {
    id: "scene",
    name: "Scene Track",
    description: "场景轨道 · 支持 hero / stat 两种 layout · 适合开场标题 / 关键数据",
    use_cases: ["开场介绍", "关键数据", "章节过渡"],
    viewport: "any",
    // FM-T0 gate: render(t=0) opacity must be >= 0.9. We target 0.95 so we
    // have headroom; lint enforces the 0.9 minimum.
    t0_visibility: 0.95,
    params: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      required: ["layout"],
      additionalProperties: false,
      properties: {
        layout: { type: "string", enum: ["hero", "stat"] },
        title: { type: "string", maxLength: 200 },
        subtitle: { type: "string", maxLength: 200 },
        big_number: { type: "string", maxLength: 32 },
        label: { type: "string", maxLength: 200 },
        sublabel: { type: "string", maxLength: 200 },
        accent_color: {
          type: "string",
          pattern: "^#[0-9a-fA-F]{6}$",
        },
        bg_color: {
          type: "string",
          pattern: "^#[0-9a-fA-F]{6}$",
        },
      },
    },
  };
}

export function sample() {
  return {
    layout: "hero",
    title: "NextFrame",
    subtitle: "AI 视频引擎 · v1.1",
    accent_color: "#bc8cff",
  };
}

// ---------- helpers (kept in-file; zero import rule forbids extraction) ----

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function entryOpacityAt(t) {
  // t in ms; ramp to 1.0 over the first 300ms. At t=0 the value is exactly 0.9
  // which is the lower bound the FM-T0 gate accepts.
  const frac = clamp(t / 300, 0, 1);
  return 0.9 + 0.1 * frac;
}

function breatheAt(t) {
  // Gentle scale breathing so the scene never looks frozen.
  // period ~ 2.5s, amplitude 0.8%.
  const seconds = t / 1000;
  return 1 + 0.008 * Math.sin(seconds * Math.PI * 0.8);
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

function stageStyle(vp, accent, opacity, scale) {
  return (
    "position:absolute;inset:0;" +
    "width:" + vp.w + "px;height:" + vp.h + "px;" +
    "display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "background:radial-gradient(ellipse at 50% 40%, " + accent + "22 0%, #0b0d10 70%);" +
    "color:#f0f6fc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;" +
    "opacity:" + opacity.toFixed(2) + ";" +
    "transform:scale(" + scale.toFixed(4) + ");" +
    "transform-origin:50% 50%;"
  );
}

function renderHero(t, p, vp) {
  const opacity = entryOpacityAt(t);
  const scale = breatheAt(t);
  const accent = /^#[0-9a-fA-F]{6}$/.test(p.accent_color || "")
    ? p.accent_color
    : "#bc8cff";

  // Font sizes scale with viewport height so the layout adapts to any ratio.
  const titleSize = Math.round(vp.h * 0.1);
  const subSize = Math.round(vp.h * 0.035);
  const gap = Math.round(vp.h * 0.02);

  const title = escapeHtml(p.title || "");
  const subtitle = escapeHtml(p.subtitle || "");

  return (
    '<div data-layout="hero" style="' + stageStyle(vp, accent, opacity, scale) + '">' +
      '<div style="' +
        'font-size:' + titleSize + 'px;font-weight:700;letter-spacing:-0.02em;' +
        'line-height:1.05;text-align:center;' +
        'background:linear-gradient(180deg,#f0f6fc 0%,' + accent + ' 100%);' +
        '-webkit-background-clip:text;background-clip:text;color:transparent;' +
        'opacity:' + opacity.toFixed(2) + ';' +
      '">' + title + '</div>' +
      (subtitle
        ? '<div style="' +
            'margin-top:' + gap + 'px;' +
            'font-size:' + subSize + 'px;font-weight:400;color:#8b949e;' +
            'text-align:center;letter-spacing:0.04em;' +
            'opacity:' + opacity.toFixed(2) + ';' +
          '">' + subtitle + '</div>'
        : "") +
    '</div>'
  );
}

function renderStat(t, p, vp) {
  const opacity = entryOpacityAt(t);
  const scale = breatheAt(t);
  const accent = /^#[0-9a-fA-F]{6}$/.test(p.accent_color || "")
    ? p.accent_color
    : "#58a6ff";

  const numSize = Math.round(vp.h * 0.28);
  const labelSize = Math.round(vp.h * 0.04);
  const subSize = Math.round(vp.h * 0.025);
  const gap = Math.round(vp.h * 0.015);

  const bigNumber = escapeHtml(p.big_number || "");
  const label = escapeHtml(p.label || "");
  const sublabel = escapeHtml(p.sublabel || "");

  return (
    '<div data-layout="stat" style="' + stageStyle(vp, accent, opacity, scale) + '">' +
      '<div style="' +
        'font-size:' + numSize + 'px;font-weight:800;letter-spacing:-0.04em;' +
        'line-height:1;' +
        'background:linear-gradient(180deg,' + accent + ' 0%,#f0f6fc 100%);' +
        '-webkit-background-clip:text;background-clip:text;color:transparent;' +
        'opacity:' + opacity.toFixed(2) + ';' +
      '">' + bigNumber + '</div>' +
      (label
        ? '<div style="' +
            'margin-top:' + gap + 'px;' +
            'font-size:' + labelSize + 'px;font-weight:500;color:#f0f6fc;' +
            'text-align:center;' +
            'opacity:' + opacity.toFixed(2) + ';' +
          '">' + label + '</div>'
        : "") +
      (sublabel
        ? '<div style="' +
            'margin-top:' + Math.round(gap / 2) + 'px;' +
            'font-size:' + subSize + 'px;font-weight:400;color:#8b949e;' +
            'text-align:center;letter-spacing:0.04em;' +
            'opacity:' + opacity.toFixed(2) + ';' +
          '">' + sublabel + '</div>'
        : "") +
    '</div>'
  );
}

export function render(t, params, viewport) {
  const p = params || {};
  const vp =
    viewport && typeof viewport.w === "number" && typeof viewport.h === "number"
      ? viewport
      : { w: 1920, h: 1080 };

  if (p.layout === "stat") {
    return renderStat(t, p, vp);
  }
  // default (and "hero"): hero layout
  return renderHero(t, p, vp);
}
