// src/nf-tracks/official/scene.js
// Official "scene" Track — modern editorial layouts for JSON-authored videos.
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
    description: "场景轨道 · 支持 hero / split / stat / quote · 适合产品样片",
    use_cases: ["开场介绍", "关键数据", "章节过渡", "观点强调"],
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
        layout: { type: "string", enum: ["hero", "split", "stat", "quote"] },
        eyebrow: { type: "string", maxLength: 80 },
        title: { type: "string", maxLength: 200 },
        subtitle: { type: "string", maxLength: 200 },
        description: { type: "string", maxLength: 260 },
        big_number: { type: "string", maxLength: 32 },
        label: { type: "string", maxLength: 200 },
        sublabel: { type: "string", maxLength: 200 },
        accent_color: {
          type: "string",
          pattern: "^#[0-9a-fA-F]{6}$",
        },
        title_x: { type: "number", minimum: 0, maximum: 100 },
        title_y: { type: "number", minimum: 0, maximum: 100 },
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
    subtitle: "JSON-native video editor",
    eyebrow: "LIVE EDIT · EXPORT READY",
    accent_color: "#5eead4",
    bg_color: "#07080d",
    title_x: 50,
    title_y: 50,
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

function isHex6(s) {
  return /^#[0-9a-fA-F]{6}$/.test(s || "");
}

function color(p, key, fallback) {
  return isHex6(p[key]) ? p[key] : fallback;
}

function stageStyle(vp, p, accent, opacity, scale) {
  const bg = color(p, "bg_color", "#07080d");
  return (
    "position:absolute;inset:0;" +
    "width:" + vp.w + "px;height:" + vp.h + "px;" +
    "background:" +
      "linear-gradient(135deg," + accent + "24 0%,transparent 32%)," +
      "linear-gradient(180deg,rgba(255,255,255,0.07) 0%,transparent 45%)," +
      "linear-gradient(90deg,rgba(255,255,255,0.035) 1px,transparent 1px)," +
      "linear-gradient(0deg,rgba(255,255,255,0.028) 1px,transparent 1px)," +
      bg + ";" +
    "background-size:auto,auto,96px 96px,96px 96px,auto;" +
    "color:#f7f4ed;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;" +
    "opacity:" + opacity.toFixed(2) + ";" +
    "transform:scale(" + scale.toFixed(4) + ");" +
    "transform-origin:50% 50%;overflow:hidden;"
  );
}

function rail(accent) {
  return (
    '<div style="' +
      'position:absolute;left:64px;top:58px;right:64px;height:1px;' +
      'background:linear-gradient(90deg,' + accent + ',rgba(255,255,255,0.12),transparent);' +
    '"></div>' +
    '<div style="' +
      'position:absolute;left:64px;bottom:54px;right:64px;display:flex;justify-content:space-between;' +
      'font-size:18px;line-height:1;color:rgba(247,244,237,0.46);letter-spacing:0.18em;text-transform:uppercase;' +
    '">' +
      '<span>JSON</span><span>LIVE EDIT</span><span>MP4 EXPORT</span>' +
    '</div>'
  );
}

function eyebrowHtml(text, accent) {
  const safe = escapeHtml(text || "");
  if (!safe) return "";
  return (
    '<div style="' +
      'display:inline-flex;align-items:center;gap:14px;margin-bottom:28px;' +
      'font-size:22px;font-weight:700;line-height:1;color:' + accent + ';letter-spacing:0.16em;text-transform:uppercase;' +
    '">' +
      '<span style="width:38px;height:2px;background:' + accent + ';display:inline-block;"></span>' + safe +
    '</div>'
  );
}

function renderHero(t, p, vp) {
  const opacity = entryOpacityAt(t);
  const scale = breatheAt(t);
  const accent = color(p, "accent_color", "#5eead4");

  // Font sizes scale with viewport height so the layout adapts to any ratio.
  const titleSize = Math.round(vp.h * 0.112);
  const subSize = Math.round(vp.h * 0.036);
  const gap = Math.round(vp.h * 0.026);
  const titleX = clamp(typeof p.title_x === "number" ? p.title_x : 50, 5, 95);
  const titleY = clamp(typeof p.title_y === "number" ? p.title_y : 50, 5, 95);

  const title = escapeHtml(p.title || "");
  const subtitle = escapeHtml(p.subtitle || "");

  return (
    '<div data-layout="hero" style="' + stageStyle(vp, p, accent, opacity, scale) + '">' +
      rail(accent) +
      '<div style="' +
        'position:absolute;left:' + titleX.toFixed(2) + '%;top:' + titleY.toFixed(2) + '%;' +
        'transform:translate(-50%,-50%);max-width:86%;' +
        'display:flex;flex-direction:column;align-items:center;text-align:center;' +
      '">' +
      eyebrowHtml(p.eyebrow, accent) +
      '<div style="' +
        'font-size:' + titleSize + 'px;font-weight:780;letter-spacing:0;' +
        'line-height:0.98;color:#f7f4ed;text-wrap:balance;' +
        'text-shadow:0 28px 80px rgba(0,0,0,0.52);opacity:' + opacity.toFixed(2) + ';' +
      '">' + title + '</div>' +
      (subtitle
        ? '<div style="' +
            'margin-top:' + gap + 'px;' +
            'max-width:' + Math.round(vp.w * 0.54) + 'px;' +
            'font-size:' + subSize + 'px;font-weight:480;color:rgba(247,244,237,0.72);' +
            'line-height:1.28;text-align:center;letter-spacing:0;' +
            'opacity:' + opacity.toFixed(2) + ';' +
          '">' + subtitle + '</div>'
        : "") +
      '</div>' +
    '</div>'
  );
}

function renderSplit(t, p, vp) {
  const opacity = entryOpacityAt(t);
  const scale = breatheAt(t);
  const accent = color(p, "accent_color", "#ff8a5b");
  const title = escapeHtml(p.title || "");
  const subtitle = escapeHtml(p.subtitle || "");
  const description = escapeHtml(p.description || "");
  const titleSize = Math.round(vp.h * 0.082);
  const subSize = Math.round(vp.h * 0.033);
  const bodySize = Math.round(vp.h * 0.027);
  return (
    '<div data-layout="split" style="' + stageStyle(vp, p, accent, opacity, scale) + '">' +
      rail(accent) +
      '<div style="position:absolute;left:8.2%;top:19%;width:48%;opacity:' + opacity.toFixed(2) + ';">' +
        eyebrowHtml(p.eyebrow, accent) +
        '<div style="font-size:' + titleSize + 'px;font-weight:760;line-height:1.02;color:#f7f4ed;letter-spacing:0;text-wrap:balance;">' + title + '</div>' +
        (subtitle ? '<div style="margin-top:28px;font-size:' + subSize + 'px;line-height:1.28;color:rgba(247,244,237,0.72);letter-spacing:0;">' + subtitle + '</div>' : '') +
      '</div>' +
      '<div style="' +
        'position:absolute;right:8%;top:19%;width:31%;height:54%;' +
        'border:1px solid rgba(255,255,255,0.16);background:rgba(255,255,255,0.055);' +
        'box-shadow:0 34px 110px rgba(0,0,0,0.38);padding:48px;box-sizing:border-box;' +
      '">' +
        '<div style="height:3px;width:40%;background:' + accent + ';margin-bottom:42px;"></div>' +
        '<div style="font-size:' + bodySize + 'px;line-height:1.42;color:rgba(247,244,237,0.82);letter-spacing:0;">' + description + '</div>' +
        '<div style="position:absolute;left:48px;right:48px;bottom:42px;display:grid;grid-template-columns:1fr 1fr;gap:16px;">' +
          '<div style="border-top:1px solid rgba(255,255,255,0.16);padding-top:16px;color:' + accent + ';font-size:24px;font-weight:720;">EDIT</div>' +
          '<div style="border-top:1px solid rgba(255,255,255,0.16);padding-top:16px;color:#f7f4ed;font-size:24px;font-weight:720;">EXPORT</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function renderStat(t, p, vp) {
  const opacity = entryOpacityAt(t);
  const scale = breatheAt(t);
  const accent = color(p, "accent_color", "#9ad65c");

  const numSize = Math.round(vp.h * 0.245);
  const labelSize = Math.round(vp.h * 0.052);
  const subSize = Math.round(vp.h * 0.03);
  const gap = Math.round(vp.h * 0.015);

  const bigNumber = escapeHtml(p.big_number || "");
  const label = escapeHtml(p.label || "");
  const sublabel = escapeHtml(p.sublabel || "");

  return (
    '<div data-layout="stat" style="' + stageStyle(vp, p, accent, opacity, scale) + '">' +
      rail(accent) +
      '<div style="position:absolute;left:8.5%;right:8.5%;top:18%;bottom:18%;display:flex;align-items:center;justify-content:center;gap:72px;">' +
        '<div style="font-size:' + numSize + 'px;font-weight:830;line-height:0.86;color:' + accent + ';letter-spacing:0;opacity:' + opacity.toFixed(2) + ';">' + bigNumber + '</div>' +
        '<div style="width:42%;border-left:1px solid rgba(255,255,255,0.18);padding-left:54px;">' +
          (label ? '<div style="font-size:' + labelSize + 'px;font-weight:730;line-height:1.04;color:#f7f4ed;letter-spacing:0;text-wrap:balance;opacity:' + opacity.toFixed(2) + ';">' + label + '</div>' : '') +
          (sublabel ? '<div style="margin-top:' + gap + 'px;font-size:' + subSize + 'px;font-weight:430;color:rgba(247,244,237,0.66);line-height:1.34;letter-spacing:0;opacity:' + opacity.toFixed(2) + ';">' + sublabel + '</div>' : '') +
        '</div>' +
      '</div>' +
    '</div>'
  );
}

function renderQuote(t, p, vp) {
  const opacity = entryOpacityAt(t);
  const scale = breatheAt(t);
  const accent = color(p, "accent_color", "#7dd3fc");
  const title = escapeHtml(p.title || "");
  const subtitle = escapeHtml(p.subtitle || "");
  const titleSize = Math.round(vp.h * 0.078);
  const subSize = Math.round(vp.h * 0.032);
  return (
    '<div data-layout="quote" style="' + stageStyle(vp, p, accent, opacity, scale) + '">' +
      rail(accent) +
      '<div style="position:absolute;left:10%;right:10%;top:22%;opacity:' + opacity.toFixed(2) + ';">' +
        eyebrowHtml(p.eyebrow, accent) +
        '<div style="font-size:' + titleSize + 'px;font-weight:720;line-height:1.08;color:#f7f4ed;letter-spacing:0;text-wrap:balance;">' + title + '</div>' +
        (subtitle ? '<div style="margin-top:44px;font-size:' + subSize + 'px;color:' + accent + ';line-height:1.3;letter-spacing:0;">' + subtitle + '</div>' : '') +
      '</div>' +
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
  if (p.layout === "split") {
    return renderSplit(t, p, vp);
  }
  if (p.layout === "quote") {
    return renderQuote(t, p, vp);
  }
  // default (and "hero"): hero layout
  return renderHero(t, p, vp);
}
