// nextframe scene-smoke --ratio=<ratio> --theme=<theme>
//
// Scans scenes/{ratio-dir}/{theme}/*.js, validates 30+ contract fields,
// runs sample()+render()+describe() for each. dom scenes may mutate host,
// return an HTML string, or draw into an inline <canvas> inside host.

import { parseFlags } from "../_helpers/_io.js";
import { readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createCanvas } from "../../lib/canvas-factory.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../../..");
const SCENES_ROOT = resolve(REPO_ROOT, "src/nf-core/scenes");
const RATIO_DIRS: Record<string, string> = { "16:9": "16x9", "9:16": "9x16", "1:1": "1x1", "4:3": "4x3" };
const RATIO_WH: Record<string, [number, number]> = {
  "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:3": [1440, 1080],
};

const REQUIRED = [
  "id","name","version","ratio","theme","role","description","duration_hint",
  "type","frame_pure","assets","params",
  "intent","when_to_use","when_not_to_use","limitations","inspired_by","used_in",
  "requires","pairs_well_with","conflicts_with","alternatives",
  "visual_weight","z_layer","mood","tags","complexity","performance","status","changelog",
  "render","describe","sample",
];
const VALID_TYPES = new Set(["dom", "media"]);

const HELP = `nextframe scene-smoke --ratio=<ratio> --theme=<theme> [opts]

Smoke test all scenes in {ratio-dir}/{theme}/: validate 30+ fields, run
render/describe/sample.

Required:
  --ratio    16:9 | 9:16 | 1:1 | 4:3
  --theme    theme name

Optional:
  --json     emit results as JSON

Exits non-zero if any scene fails.
`;

interface FakeHost {
  _html: string;
  _children: unknown[];
  children: unknown[];
  innerHTML: string;
  childNodes: unknown[];
  appendChild(n: unknown): unknown;
  removeChild(n: unknown): unknown;
  setAttribute(k: string, v: string): void;
  querySelector(selector: string): unknown;
  style: Record<string, string>;
  __canvas: ReturnType<typeof createCanvas> | null;
  wasMutated: boolean;
}

interface Result {
  file: string;
  status: "pass" | "fail";
  missing: string[];
  errors: string[];
}

function parseCanvasAttr(html: string, name: string, fallback: number): number {
  const match = html.match(new RegExp(`${name}=["']?(\\d+)`, "i"));
  return match ? Number(match[1]) : fallback;
}

function makeFakeHost(vp: { width: number; height: number }): FakeHost {
  const children: unknown[] = [];
  const host = {
    _html: "",
    _children: children,
    children,
    __canvas: null,
    get innerHTML() { return this._html; },
    set innerHTML(v: string) {
      this._html = String(v);
      this.__canvas = null;
    },
    childNodes: children,
    appendChild(n: unknown) { this._children.push(n); return n; },
    removeChild(n: unknown) {
      const i = this._children.indexOf(n);
      if (i >= 0) this._children.splice(i, 1);
      return n;
    },
    setAttribute() {},
    querySelector(selector: string) {
      if (selector !== "canvas" || !/<canvas\b/i.test(this._html)) return null;
      if (!this.__canvas) {
        const width = parseCanvasAttr(this._html, "width", vp.width);
        const height = parseCanvasAttr(this._html, "height", vp.height);
        this.__canvas = createCanvas(width, height);
      }
      return this.__canvas;
    },
    style: {},
    get wasMutated() { return this._html.length > 0 || this._children.length > 0 || Boolean(this.__canvas); },
  } as FakeHost;
  return host;
}

export async function run(argv: string[]): Promise<number> {
  const { flags } = parseFlags(argv);
  if (flags.help) { process.stdout.write(HELP); return 0; }

  const ratio = String(flags.ratio || "").trim();
  const theme = String(flags.theme || "").trim();
  const asJson = Boolean(flags.json);

  if (!(ratio in RATIO_DIRS)) {
    process.stderr.write(`error: --ratio must be one of: ${Object.keys(RATIO_DIRS).join(", ")}\n`);
    return 1;
  }
  if (!theme) { process.stderr.write(`error: --theme required\n`); return 1; }

  const themeDir = join(SCENES_ROOT, RATIO_DIRS[ratio], theme);
  if (!existsSync(themeDir)) {
    process.stderr.write(`error: theme dir not found: ${themeDir}\n`);
    return 1;
  }

  const [W, H] = RATIO_WH[ratio];
  const vp = { width: W, height: H };
  const files = readdirSync(themeDir).filter(f => f.endsWith(".js") && !f.startsWith("_"));
  const results: Result[] = [];

  for (const file of files) {
    const path = join(themeDir, file);
    const result: Result = { file, status: "pass", missing: [], errors: [] };
    try {
      const mod = await import(pathToFileURL(path).href) as { default?: Record<string, unknown> };
      const c = mod.default;
      if (!c || typeof c !== "object") {
        result.status = "fail";
        result.errors.push("no default export object");
        results.push(result);
        continue;
      }

      const cr = c as Record<string, unknown>;
      for (const k of REQUIRED) {
        if (cr[k] === undefined) result.missing.push(k);
      }
      if (!VALID_TYPES.has(String(cr.type))) {
        result.errors.push(`invalid type "${cr.type}" (must be dom|media)`);
      }
      if (typeof cr.intent === "string" && cr.intent.length < 50) {
        result.errors.push(`intent too short (${cr.intent.length} chars)`);
      }

      let params: unknown;
      let sampleOk = false;
      try {
        params = (cr.sample as (() => unknown))();
        sampleOk = true;
      } catch (error) {
        result.errors.push(`sample() threw: ${(error as Error).message}`);
      }

      if (sampleOk) {
        try {
          (cr.describe as ((t: number, p: unknown, vp: unknown) => unknown))(0.5, params, vp);
        } catch (error) {
          result.errors.push(`describe() threw: ${(error as Error).message}`);
        }
      }

      if (sampleOk) {
        try {
          const host = makeFakeHost(vp);
          const out = (cr.render as ((h: unknown, t: number, p: unknown, vp: unknown) => unknown))(host, 0.5, params, vp);
          if (typeof out === "string") host.innerHTML = out;
          if (!host.wasMutated) {
            result.errors.push("render(host) did not mutate host or return HTML");
          }
        } catch (error) {
          result.errors.push(`render() threw: ${(error as Error).message}`);
        }
      }

      if (result.missing.length || result.errors.length) result.status = "fail";
    } catch (error) {
      result.status = "fail";
      result.errors.push(`import: ${(error as Error).message}`);
    }
    results.push(result);
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({ ratio, theme, results }, null, 2) + "\n");
  } else {
    let pass = 0;
    for (const r of results) {
      if (r.status === "pass") pass++;
      const tag = r.status === "pass" ? "✓" : "✗";
      process.stdout.write(`${tag} ${r.file}\n`);
      if (r.missing.length) process.stdout.write(`   missing: ${r.missing.join(", ")}\n`);
      if (r.errors.length) for (const e of r.errors) process.stdout.write(`   error: ${e}\n`);
    }
    process.stdout.write(`\n${pass}/${results.length} pass\n`);
  }
  return results.some(r => r.status === "fail") ? 1 : 0;
}
