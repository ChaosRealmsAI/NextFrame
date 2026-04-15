#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { createCanvas, ensureCanvasFonts } from "../src/nf-cli/src/lib/canvas-factory.js";

const SAMPLE_TEXT = "你好世界 Hello World 你写了 1 行";
const OUTPUT = "/tmp/cjk-test.png";
const WIDTH = 1400;
const HEIGHT = 520;
const TILE = 140;
const FONT_STACK = '700 72px "PingFang SC", "Hiragino Sans GB", system-ui, sans-serif';
const HAN_REGEX = /\p{Script=Han}/u;

function isHan(char) {
  return HAN_REGEX.test(char);
}

function hashGlyph(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let count = 0;
  let hash = 2166136261;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3];
      if (alpha === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count++;
      hash ^= data[offset] + data[offset + 1] + data[offset + 2] + alpha + x + y;
      hash = Math.imul(hash, 16777619) >>> 0;
    }
  }

  if (count === 0) return "empty";
  return [minX, minY, maxX, maxY, count, hash].join(":");
}

function renderGlyphHash(char) {
  const canvas = createCanvas(TILE, TILE);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, TILE, TILE);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = FONT_STACK;
  ctx.fillText(char, TILE / 2, TILE / 2 + 4);
  return hashGlyph(ctx.getImageData(0, 0, TILE, TILE).data, TILE, TILE);
}

function getMissingGlyphHashes() {
  const sentinels = [
    String.fromCodePoint(0x10ffff),
    String.fromCodePoint(0x1fffe),
    "\u0378",
    "�",
  ];
  return new Set(sentinels.map((char) => renderGlyphHash(char)).filter((hash) => hash !== "empty"));
}

function detectTofu(chars) {
  const uniqueChars = [...new Set(chars.filter((char) => isHan(char)))];
  const missingHashes = getMissingGlyphHashes();
  const groups = new Map();

  for (const char of uniqueChars) {
    const hash = renderGlyphHash(char);
    const group = groups.get(hash) || [];
    group.push(char);
    groups.set(hash, group);
  }

  const badChars = new Set();
  for (const [hash, group] of groups.entries()) {
    if (hash === "empty" || missingHashes.has(hash) || group.length > 1) {
      for (const char of group) badChars.add(char);
    }
  }
  return {
    uniqueChars,
    badChars: [...badChars],
  };
}

function drawSample(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1a1510";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, "rgba(218,119,86,0.22)");
  gradient.addColorStop(1, "rgba(234,179,89,0.08)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "#f5ece0";
  ctx.font = FONT_STACK;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(SAMPLE_TEXT, 80, 96);

  ctx.font = '500 28px "SF Mono", Menlo, monospace';
  ctx.fillStyle = "rgba(245,236,224,0.72)";
  ctx.fillText("CJK glyph probe", 80, 210);

  const chars = [...new Set(Array.from(SAMPLE_TEXT).filter((char) => isHan(char)))];
  chars.forEach((char, index) => {
    const x = 80 + (index % 6) * 180;
    const y = 280 + Math.floor(index / 6) * 160;
    ctx.fillStyle = "rgba(245,236,224,0.08)";
    ctx.fillRect(x, y, 132, 132);
    ctx.strokeStyle = "rgba(245,236,224,0.15)";
    ctx.strokeRect(x, y, 132, 132);
    ctx.fillStyle = "#ffffff";
    ctx.font = FONT_STACK;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(char, x + 66, y + 70);
  });

  return ctx;
}

ensureCanvasFonts();
const canvas = createCanvas(WIDTH, HEIGHT);
drawSample(canvas);
await writeFile(OUTPUT, await canvas.encode("png"));

const { uniqueChars, badChars } = detectTofu(Array.from(SAMPLE_TEXT));
if (badChars.length > 0) {
  console.log(`✗ Square glyphs detected: ${badChars.join("")}`);
  console.log(`✗ Output: ${OUTPUT}`);
  process.exit(1);
}

console.log(`✓ All ${uniqueChars.length} CJK chars rendered: ${uniqueChars.join("")}`);
console.log(`✓ Output: ${OUTPUT}`);
