#!/usr/bin/env node
// Generate showcase thumbnails for all 33 scenes.
// Canvas scenes: render with curated params at the best time.
// Browser scenes: render sample content via puppeteer if available, else use fallback.

import { createCanvas } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { REGISTRY, SCENE_IDS, META_TABLE } from "../src/scenes/index.js";
import "../src/engine/legacy/fonts.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "../preview/thumbs");
const W = 480, H = 270;

mkdirSync(OUT, { recursive: true });

// Curated showcase params — best visual for each scene
const SHOWCASE = {
  auroraGradient: { t: 4.8, params: { hueA: 280, hueB: 180, hueC: 330, intensity: 1.2, grain: 0.03 } },
  fluidBackground: { t: 5, params: { blobCount: 6, hueA: 220, hueB: 300, hueC: 350, intensity: 0.8, blur: 60 } },
  starfield: { t: 6, params: { hueBase: 220, hueShift: 120, density: 1.4, glow: 1.3 } },
  spotlightSweep: { t: 3.5, params: { beamCount: 4, hueA: 200, hueB: 330, sweepSpeed: 0.6, intensity: 1 } },
  pixelRain: { t: 4, params: { columns: 36, hueStart: 130, hueEnd: 200, speed: 200, glyphPalette: "01アイウエオ" } },
  particleFlow: { t: 5, params: { count: 600, hueA: 170, hueB: 310, speed: 100, trailLength: 32 } },
  orbitRings: { t: 5, params: { ringCount: 7, hueA: 190, hueB: 310, baseSpeed: 0.5, glow: true } },
  kineticHeadline: { t: 2.5, params: { text: "NEXTFRAME", subtitle: "Frame-pure scene library", hueStart: 25, hueEnd: 330, stagger: 0.15, size: 0.13 } },
  glitchText: { t: 1.8, params: { text: "GLITCH", fontSize: 160, baseHue: 310, glitchAmount: 0.5, scanlines: true } },
  countdown: { t: 2.4, params: { sequence: "5,4,3,2,1,GO", subtitle: "LAUNCHING", hueStart: 20, hueEnd: 150 } },
  circleRipple: { t: 3, params: { hueStart: 180, hueSpan: 200, ringCount: 10, thickness: 0.015 } },
  meshGrid: { t: 5, params: { cols: 22, rows: 16, hueA: 210, hueB: 330, waveSpeed: 0.8, perspective: 0.5 } },
  neonGrid: { t: 5, params: { hueHorizon: 310, hueGrid: 270, scrollSpeed: 0.5, lineCount: 18 } },
  shapeBurst: { t: 0.6, params: { count: 150, shape: "mixed", hueStart: 190, hueEnd: 340, speed: 250, gravity: 60, fadeOut: true } },
  barChartReveal: { t: 3.5, params: { title: "MONTHLY GROWTH", unit: "%", hueStart: 210, hueEnd: 330, stagger: 0.1 } },
  lineChart: { t: 4, params: { title: "ACTIVE USERS", hueStart: 180, hueEnd: 320 } },
  dataPulse: { t: 4, params: { bars: 48, hueA: 190, hueB: 310, peak: 0.9 } },
  textOverlay: { t: 2, params: { text: "HELLO WORLD", fontSize: 120, color: "#ffffff", weight: "900", align: "center", anchor: "center" } },
  lowerThirdVelvet: { t: 2.5, params: { title: "NEXTFRAME", subtitle: "Scene Registry v0.1", hueA: 22, hueB: 310 } },
  cornerBadge: { t: 2, params: { label: "NEW", subtitle: "33 SCENES AVAILABLE", hue: 340 } },
  vignette: { t: 3, params: { intensity: 0.8, hue: 250, radius: 0.7 } },
  ccFrame: { t: 5, params: { tag: "OPC · 王宇轩", series: "《深入浅出 Claude Code 源代码》", subtitle: "以终为始：从最终提示词倒推逻辑", ep: "E01", duration: 72 } },
  ccBigNumber: { t: 3, params: { number: "87", label: "类提示词" } },
  ccPill: { t: 3, params: { text: "ANTHROPIC CONFIDENTIAL · LEAKED", x: 0.5, y: 0.45 } },
  ccNote: { t: 3, params: { text: "以 Claude Code 第一人称讲述", x: 0.5, y: 0.5, delay: 0 } },
  ccDesc: { t: 3, params: { text: "我数过了。", x: 0.5, y: 0.5, delay: 0 } },
  // Browser scenes get designed fallbacks below
  imageHero: { t: 3, params: {} },
  videoClip: { t: 3, params: {} },
  videoWindow: { t: 3, params: {} },
};

// Render canvas scenes
let ok = 0, fail = 0;
for (const id of SCENE_IDS) {
  const entry = REGISTRY.get(id);
  if (!entry) continue;

  // Browser scenes: use designed thumbnails (already generated)
  if (["htmlSlide", "svgOverlay", "markdownSlide", "lottieAnim"].includes(id)) {
    renderDesignedThumb(id);
    ok++;
    continue;
  }

  const showcase = SHOWCASE[id] || {};
  const t = showcase.t || (entry.META.duration_hint || 5) * 0.4;
  const params = showcase.params || {};

  try {
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#1a1510";
    ctx.fillRect(0, 0, W, H);
    entry.render(t, params, ctx, t);
    writeFileSync(`${OUT}/${id}.png`, canvas.toBuffer("image/png"));
    console.log(`✓ ${id}`);
    ok++;
  } catch (e) {
    console.log(`✗ ${id}: ${e.message}`);
    fail++;
  }
}

// Designed thumbnails for browser scenes
function renderDesignedThumb(id) {
  const configs = {
    htmlSlide: {
      title: "<html>",
      sub: "HTML+CSS Slide",
      accent: "#8b5cf6",
      lines: [
        '<div class="hero">',
        "  <h1>Product Launch</h1>",
        "  <p>Rendered via Chrome</p>",
        "  <button>Get Started</button>",
        "</div>",
      ],
    },
    svgOverlay: {
      title: "<svg>",
      sub: "SVG Overlay",
      accent: "#6366f1",
      lines: [
        '<svg viewBox="0 0 200 200">',
        '  <circle cx="100" cy="80" r="40"',
        '    fill="#da7756" />',
        '  <rect x="60" y="140" width="80"',
        '    height="30" rx="4" fill="#6366f1"/>',
        "</svg>",
      ],
    },
    markdownSlide: {
      title: "# Markdown",
      sub: "Styled Documentation Slide",
      accent: "#10b981",
      lines: [
        "## Getting Started",
        "",
        "- Frame-pure rendering",
        "- 33 scenes available",
        "- **Zero dependencies**",
        "",
        "> Built for AI agents",
      ],
    },
    lottieAnim: {
      title: "Lottie",
      sub: "After Effects Animation",
      accent: "#f59e0b",
      lines: [
        '{ "v": "5.7.4",',
        '  "fr": 30, "ip": 0,',
        '  "op": 120,',
        '  "layers": [{',
        '    "ty": 4,',
        '    "shapes": [...]',
        "  }]",
        "}",
      ],
    },
  };

  const cfg = configs[id];
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");

  // Dark background with subtle pattern
  ctx.fillStyle = "#0e0d16";
  ctx.fillRect(0, 0, W, H);

  // Subtle dot grid
  ctx.fillStyle = "rgba(218,119,86,0.04)";
  for (let x = 20; x < W; x += 20) {
    for (let y = 20; y < H; y += 20) {
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Accent glow
  const glow = ctx.createRadialGradient(W * 0.3, H * 0.4, 0, W * 0.3, H * 0.4, W * 0.5);
  glow.addColorStop(0, cfg.accent + "15");
  glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Border frame
  ctx.strokeStyle = cfg.accent + "30";
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // Title
  ctx.fillStyle = cfg.accent;
  ctx.font = "700 26px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(cfg.title, W / 2, 72);

  // Subtitle
  ctx.fillStyle = "rgba(245,236,224,0.45)";
  ctx.font = "400 12px system-ui";
  ctx.fillText(cfg.sub, W / 2, 92);

  // Code lines
  ctx.fillStyle = "rgba(245,236,224,0.28)";
  ctx.font = "400 11px monospace";
  ctx.textAlign = "left";
  for (let i = 0; i < cfg.lines.length; i++) {
    ctx.fillText(cfg.lines[i], 52, 120 + i * 18);
  }

  // Type badge
  ctx.font = "600 9px system-ui";
  ctx.textAlign = "right";
  const badge = "BROWSER";
  const bw = ctx.measureText(badge).width + 14;
  ctx.fillStyle = cfg.accent + "18";
  ctx.fillRect(W - 20 - bw, 20, bw, 20);
  ctx.fillStyle = cfg.accent;
  ctx.fillText(badge, W - 27, 34);

  writeFileSync(`${OUT}/${id}.png`, c.toBuffer("image/png"));
  console.log(`✓ ${id} (designed)`);
}

console.log(`\nDone: ${ok} ok, ${fail} failed`);
