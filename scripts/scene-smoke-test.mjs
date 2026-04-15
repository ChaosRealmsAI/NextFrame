#!/usr/bin/env node
// Smoke test all scenes in a theme dir:
// - Import, validate 30+ contract fields
// - Run sample()+render()+describe() — branches on c.type for correct signature
//   - canvas: pass CanvasRenderingContext2D, encode PNG
//   - dom / svg / media: pass a minimal fake HTMLElement-like host, check mutation
import { readdir, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCanvas } from "../src/nf-cli/src/lib/canvas-factory.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.SCENES_DIR
  ? process.env.SCENES_DIR
  : join(__dirname, "../src/nf-core/scenes/16x9/anthropic-warm");
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

const VALID_TYPES = new Set(["canvas", "dom", "svg", "media"]);

// Minimal HTMLElement-like stub for dom/svg/media render smoke.
// Enough to detect "did render mutate the host at all?"
function makeFakeHost() {
  const host = {
    _html: "",
    _children: [],
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    childNodes: [],
    appendChild(node) {
      this._children.push(node);
      this.childNodes.push(node);
      return node;
    },
    removeChild(node) {
      const i = this._children.indexOf(node);
      if (i >= 0) this._children.splice(i, 1);
      return node;
    },
    setAttribute() {},
    style: {},
    get wasMutated() {
      return this._html.length > 0 || this._children.length > 0;
    },
  };
  return host;
}

const files = (await readdir(DIR)).filter(f => f.endsWith(".js") && !f.startsWith("_"));
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
    if (!VALID_TYPES.has(c.type)) {
      result.errors.push(`invalid type "${c.type}" (must be canvas|dom|svg|media)`);
    }
    if (typeof c.intent === "string" && c.intent.length < 50) {
      result.errors.push(`intent too short (${c.intent.length} chars)`);
    }

    let params;
    try { params = c.sample(); }
    catch(e) { result.errors.push(`sample() threw: ${e.message}`); }

    if (params) {
      try { c.describe(0.5, params, { width: 1920, height: 1080 }); }
      catch(e) { result.errors.push(`describe() threw: ${e.message}`); }
    }

    if (params) {
      try {
        if (c.type === "canvas") {
          const canvas = createCanvas(1920, 1080);
          const ctx = canvas.getContext("2d");
          c.render(ctx, 0.5, params, { width: 1920, height: 1080 });
          const png = await canvas.encode("png");
          await writeFile(join(OUT, file.replace(".js", ".png")), png);
        } else {
          // dom / svg / media — use fake host, verify mutation
          const host = makeFakeHost();
          c.render(host, 0.5, params, { width: 1920, height: 1080 });
          if (!host.wasMutated) {
            result.errors.push(`render(host) did not mutate host (innerHTML empty + no children)`);
          }
        }
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
console.log(`\n${pass}/${results.length} pass, canvas-type previews in ${OUT}/`);
process.exit(fail ? 1 : 0);
