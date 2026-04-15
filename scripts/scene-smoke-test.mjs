#!/usr/bin/env node
// Smoke test all anthropic-warm scenes: import, validate fields, run sample()+render()+describe()
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas, GlobalFonts } from "../src/nf-cli/node_modules/@napi-rs/canvas/index.js";

// Register CJK font so previews don't show □ for Chinese
try { GlobalFonts.registerFromPath("/System/Library/Fonts/Hiragino Sans GB.ttc", "PingFang SC"); } catch {}
try { GlobalFonts.registerFromPath("/System/Library/Fonts/Hiragino Sans GB.ttc", "system-ui"); } catch {}

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "../src/nf-core/scenes/16x9/anthropic-warm");
const OUT = "/tmp/scene-previews";
await mkdir(OUT, { recursive: true });

const REQUIRED = [
  "id","name","version","ratio","theme","role","description","duration_hint",
  "type","frame_pure","assets","params",
  "intent","when_to_use","when_not_to_use","limitations","inspired_by","used_in",
  "requires","pairs_well_with","conflicts_with","alternatives",
  "visual_weight","z_layer","mood","tags","complexity","performance","status","changelog",
  "render","describe","sample",
];

const files = (await readdir(DIR)).filter(f => f.endsWith(".js"));
const results = [];

for (const file of files) {
  const path = join(DIR, file);
  const result = { file, status: "unknown", missing: [], errors: [] };
  try {
    const mod = await import(path);
    const c = mod.default;
    if (!c || typeof c !== "object") {
      result.status = "fail";
      result.errors.push("no default export object");
      results.push(result);
      continue;
    }
    for (const k of REQUIRED) {
      if (c[k] === undefined) result.missing.push(k);
    }
    // intent length
    if (typeof c.intent === "string" && c.intent.length < 50) {
      result.errors.push(`intent too short (${c.intent.length} chars)`);
    }
    // sample()
    let params;
    try { params = c.sample(); }
    catch(e) { result.errors.push(`sample() threw: ${e.message}`); }
    // describe()
    if (params) {
      try { c.describe(0.5, params, { width: 1920, height: 1080 }); }
      catch(e) { result.errors.push(`describe() threw: ${e.message}`); }
    }
    // render() to canvas + save preview
    if (params) {
      try {
        const canvas = createCanvas(1920, 1080);
        const ctx = canvas.getContext("2d");
        c.render(ctx, 0.5, params, { width: 1920, height: 1080 });
        const png = await canvas.encode("png");
        await writeFile(join(OUT, file.replace(".js", ".png")), png);
      } catch(e) {
        result.errors.push(`render() threw: ${e.message}`);
      }
    }
    result.status = (result.missing.length === 0 && result.errors.length === 0) ? "pass" : "fail";
  } catch(e) {
    result.status = "fail";
    result.errors.push(`import: ${e.message}`);
  }
  results.push(result);
}

let pass = 0, fail = 0;
for (const r of results) {
  if (r.status === "pass") pass++; else fail++;
  const tag = r.status === "pass" ? "✓" : "✗";
  console.log(`${tag} ${r.file}`);
  if (r.missing.length) console.log(`   missing: ${r.missing.join(", ")}`);
  if (r.errors.length) for (const e of r.errors) console.log(`   error: ${e}`);
}
console.log(`\n${pass}/${results.length} pass, previews in ${OUT}/`);
process.exit(fail ? 1 : 0);
