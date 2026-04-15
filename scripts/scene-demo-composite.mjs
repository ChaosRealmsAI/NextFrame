#!/usr/bin/env node
// Composite demo: stack bg + chrome + content components on one canvas.
// Mimics a real slide from claude-code-源码讲解.
import { writeFile } from "node:fs/promises";
import { createCanvas, GlobalFonts } from "../src/nf-cli/node_modules/@napi-rs/canvas/index.js";

try { GlobalFonts.registerFromPath("/System/Library/Fonts/Hiragino Sans GB.ttc", "PingFang SC"); } catch {}
try { GlobalFonts.registerFromPath("/System/Library/Fonts/Hiragino Sans GB.ttc", "system-ui"); } catch {}
try { GlobalFonts.registerFromPath("/System/Library/Fonts/Hiragino Sans GB.ttc", "-apple-system"); } catch {}
try { GlobalFonts.registerFromPath("/System/Library/Fonts/Supplemental/Songti.ttc", "Georgia"); } catch {}
try { GlobalFonts.registerFromPath("/System/Library/Fonts/Supplemental/Songti.ttc", "Hiragino Mincho ProN"); } catch {}
try { GlobalFonts.registerFromPath("/System/Library/Fonts/SFNSMono.ttf", "SF Mono"); } catch {}

const DIR = "/Users/Zhuanz/bigbang/NextFrame/src/nf-core/scenes/16x9/anthropic-warm";
const W = 1920, H = 1080;

async function load(name) {
  const m = await import(`${DIR}/${name}.js`);
  return m.default;
}

async function composite(layers, outName) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  for (const layer of layers) {
    const c = await load(layer.scene);
    const params = layer.params || c.sample();
    c.render(ctx, layer.t || 0.5, params, { width: W, height: H });
  }
  const png = await canvas.encode("png");
  const out = `/tmp/scene-previews/composite-${outName}.png`;
  await writeFile(out, png);
  console.log(`✓ ${out}`);
}

// Slide 01: 类比引入 (intro headline + bg)
await composite([
  { scene: "bg-warmGradient" },
  { scene: "chrome-titleBar" },
  { scene: "chrome-footer" },
  { scene: "text-headline", params: {
    title: "你写了 1 行，系统拼了 87 类",
    subtitle: "Claude Code 内部到底有多少东西，是你看不到的",
    align: "center",
  }},
], "slide-01-intro");

// Slide 03: 四个槽位
await composite([
  { scene: "bg-warmGradient" },
  { scene: "chrome-titleBar" },
  { scene: "chrome-footer" },
  { scene: "content-fourSlots" },
], "slide-03-slots");

// Slide 11: 维度1 出厂设置（类比卡）
await composite([
  { scene: "bg-warmGradient" },
  { scene: "chrome-titleBar" },
  { scene: "chrome-footer" },
  { scene: "content-analogyCard" },
], "slide-11-analogy");

// Slide 33: 收尾金句
await composite([
  { scene: "bg-warmGradient" },
  { scene: "chrome-footer" },
  { scene: "text-goldenQuote" },
], "slide-33-quote");

// Slide 19: 数据大数字
await composite([
  { scene: "bg-warmGradient" },
  { scene: "chrome-titleBar" },
  { scene: "content-statNumber" },
], "slide-stat-87");

// Slide 21: 聊天 sim
await composite([
  { scene: "bg-warmGradient" },
  { scene: "chrome-titleBar" },
  { scene: "content-chatSim" },
], "slide-21-chat");

console.log("\nDone. Composites in /tmp/scene-previews/composite-*.png");

// More slides for full coverage
await composite([
  { scene: "bg-warmGradient" },
  { scene: "chrome-titleBar" },
  { scene: "content-flowDiagram" },
], "slide-flow");

await composite([
  { scene: "bg-warmGradient" },
  { scene: "chrome-titleBar" },
  { scene: "content-codeBlock" },
], "slide-code");

await composite([
  { scene: "bg-warmGradient" },
  { scene: "chrome-titleBar" },
  { scene: "content-keyPoints" },
], "slide-keypts");

await composite([
  { scene: "bg-warmGradient" },
  { scene: "chrome-titleBar" },
  { scene: "content-pillTags" },
], "slide-pills");
