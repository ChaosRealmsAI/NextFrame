// nextframe scene-new --id=<camelCase> --role=<role> --type=<type> --ratio=<ratio> --theme=<theme> [--name="..."] [--description="..."]
//
// Generates a new scene component file with FULL 11-required + 18 AI-understanding
// fields scaffolded, inline comments explaining each, and a type-correct render stub.
//
// Output path: src/nf-core/scenes/{ratioDir}/{theme}/{role}-{id}.js

import { parseFlags } from "../_helpers/_io.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __HERE = dirname(fileURLToPath(import.meta.url));
const SCENES_ROOT = resolve(__HERE, "../../../../nf-core/scenes");

const RATIOS = ["16:9", "9:16", "1:1", "4:3"] as const;
const RATIO_DIRS: Record<string, string> = { "16:9": "16x9", "9:16": "9x16", "1:1": "1x1", "4:3": "4x3" };
const ROLES = ["bg", "chrome", "content", "text", "overlay", "data"] as const;
// v0.9 ADR-020: added motion (frame-pure runtime type)
const TYPES = ["canvas", "dom", "svg", "media", "motion"] as const;

const HELP = `nextframe scene-new --id=<camelCase> --role=<role> --type=<type> --ratio=<ratio> --theme=<theme> [opts]

Generate a new scene component scaffold that conforms to the scene v3 contract
(11 required + 18 AI-understanding fields + render/describe/sample).

Required:
  --id          component id, camelCase, globally unique within theme (e.g. bilingualSub)
  --role        bg | chrome | content | text | overlay | data
  --type        canvas | dom | svg | media | motion  — determines render() signature
  --ratio       16:9 | 9:16 | 1:1 | 4:3
  --theme       theme name, e.g. anthropic-warm (must have existing theme.md)

Optional:
  --name        display name (defaults to id)
  --description one-line description
  --force       overwrite if file exists

Example:
  nextframe scene-new --id=chapterMark --role=overlay --type=dom --ratio=16:9 --theme=anthropic-warm \\
    --name="章节标记" --description="左上角章节编号 + 标题"

Creates: src/nf-core/scenes/16x9/anthropic-warm/overlay-chapterMark.js

After creation:
  - Fill intent (>= 50 chars real design reasoning, not boilerplate)
  - Customize params, render body, sample() with real content
  - Run: node scripts/scene-smoke-test.mjs (from repo root)
  - nextframe scenes <id> to verify
`;

function scaffold(opts: {
  id: string;
  role: string;
  type: string;
  ratio: string;
  theme: string;
  name: string;
  description: string;
}): string {
  const { id, role, type, ratio, theme, name, description } = opts;
  const today = new Date().toISOString().slice(0, 10);

  let renderSignature: string;
  let renderBody: string;
  let mountComment: string;

  if (type === "canvas") {
    renderSignature = "render(ctx, _t, params, vp)";
    mountComment = "ctx is CanvasRenderingContext2D - fillRect / fillText / arc to draw";
    renderBody = `    const W = vp.width;
    const H = vp.height;
    const color = params.color || "#f5ece0";
    const size = 48;

    ctx.fillStyle = color;
    ctx.font = \`600 \${size}px system-ui, -apple-system, "PingFang SC", sans-serif\`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(params.text || "", W * 0.5, H * 0.5);`;
  } else if (type === "dom") {
    renderSignature = "render(host, t, params, vp)";
    mountComment = "host is HTMLElement. Animate by computing opacity/transform from t (NOT CSS @keyframes — compose rebuilds host each frame, CSS animations never finish). Keep frame_pure: false if render reads t.";
    renderBody = `    const color = params.color || "#f5ece0";
    const text = params.text || "";
    // t-driven enter animation (do NOT use CSS @keyframes — see pitfalls.md #1)
    const fadeDur = 0.6;
    const p = Math.min(Math.max(t / fadeDur, 0), 1);
    const eased = 1 - Math.pow(1 - p, 3); // easeOut cubic
    const opacity = eased;
    const ty = 20 * (1 - eased); // 20px → 0

    host.innerHTML = \`
      <div style="
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, calc(-50% + \${ty}px));
        width: \${vp.width * 0.6}px;
        padding: 48px;
        color: \${color};
        opacity: \${opacity};
        font: 600 40px/1.4 system-ui, -apple-system, 'PingFang SC', sans-serif;
        text-align: center;
      ">\${escapeHtml(text)}</div>
    \`;`;
  } else if (type === "svg") {
    renderSignature = "render(host, _t, params, vp)";
    mountComment = "host is <svg> element - set innerHTML with SVG markup (works in jsdom and real DOM)";
    renderBody = `    const color = params.color || "#da7756";
    host.innerHTML = \`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \${vp.width} \${vp.height}" style="width:100%;height:100%">
        <circle cx="\${vp.width * 0.5}" cy="\${vp.height * 0.5}" r="100" fill="\${color}" />
      </svg>
    \`;`;
  } else if (type === "media") {
    renderSignature = "render(host, _t, params, vp)";
    mountComment = "host is a container HTMLElement - mount <video> / <img> / <audio>";
    renderBody = `    host.innerHTML = \`
      <video src="\${params.src}" style="
        position: absolute;
        left: 0; top: 0;
        width: \${vp.width}px;
        height: \${vp.height}px;
        object-fit: cover;
      " autoplay muted></video>
    \`;`;
  } else {
    // type === "motion" (NF-Motion, ADR-020)
    renderSignature = "render(host, _t, params, _vp)";
    mountComment = "v0.9 ADR-020: framework calls runtime/motion.js. scene returns { duration, size, layers }. Use behavior presets (impact/pulse/...) + shapes (heart/star/...) from runtime/motion.js. L7 forbids Date.now/performance.now.";
    renderBody = `    void host;  // framework renders SVG per layers
    const duration = params.duration ?? 2.5;
    return {
      duration,
      size: [400, 400],
      layers: [
        {
          type: "shape",
          shape: "heart",
          at: [200, 200],
          size: 100,
          fill: params.color ?? "#ff5889",
          behavior: "impact",
          startAt: 0,
          duration: 1.5,
        },
      ],
    };`;
  }

  const sampleDefault = type === "media"
    ? `{ src: "assets/placeholder.mp4" }`
    : `{ text: "示例内容", color: "#f5ece0" }`;

  const paramsDefault = type === "media"
    ? `    src: {
      type: "string",
      required: true,
      semantic: "媒体资源 URL (必须在 assets 数组里声明)",
    },`
    : `    text: {
      type: "string",
      required: true,
      semantic: "显示文本",
    },
    color: {
      type: "color",
      default: "#f5ece0",
      semantic: "文字颜色",
    },`;

  const assetsValue = type === "media" ? `["__REPLACE_WITH_REAL_URL__"]` : `[]`;

  const zLayer = role === "bg" ? "background"
    : (role === "chrome" || role === "overlay") ? "foreground"
    : "mid";

  const escapeHelper = type === "dom"
    ? `

// Inline utility (zero import rule) - each dom component copies this
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}`
    : "";

  return `// scenes/${RATIO_DIRS[ratio]}/${theme}/${role}-${id}.js
//
// ${name} - ${description}
//
// Scaffolded by \`nextframe scene-new\` on ${today}.
// Contract: scene v3 - single file, zero import, 11 required + 18 AI-understanding fields.
// Full spec: spec/standards/project/scene/scene-component-system.html
//
// TODO after generation:
//   [ ] Fill \`intent\` with >= 50 chars of real design reasoning (not boilerplate)
//   [ ] Populate \`when_to_use\` / \`when_not_to_use\` / \`limitations\` with specifics
//   [ ] Adjust \`params\` schema to match your actual inputs
//   [ ] Customize render() body - current code is a minimal placeholder
//   [ ] sample() returns realistic params (pull real content from script.md when possible)
//   [ ] Run: node scripts/scene-smoke-test.mjs (from repo root)

export default {
  // ===== Identity (globally unique + SemVer) =====
  id: "${id}",
  name: "${name}",
  version: "1.0.0",

  // ===== Belonging (ratio + theme determine coord system and design language) =====
  ratio: "${ratio}",
  theme: "${theme}",
  role: "${role}",               // bg | chrome | content | text | overlay | data

  // ===== Semantics =====
  description: "${description.replace(/"/g, '\\"')}",
  duration_hint: null,           // null = follows timeline; number = suggested seconds

  // ===== Render type (determines render signature) =====
  type: "${type}",
  frame_pure: true,              // same t + params => same frame; forbid Date.now / Math.random
  assets: ${assetsValue},        // external resource URL list; empty = zero external deps

  // ========================================
  // ===== AI understanding layer (18 fields) =====
  // ========================================

  // Why this component exists, design tradeoffs, visual philosophy (>= 50 chars real reasoning)
  intent: \`
    TODO: write 50+ chars of real design reasoning. Examples:
    "why this layout / why this color / why this font size /
     why pairs with X / why conflicts with Y / visual style source".
    Do NOT write "this is a component that shows text" boilerplate.
  \`,

  // Concrete scenarios (so AI search hits)
  when_to_use: [
    "TODO: concrete scenario 1",
    "TODO: concrete scenario 2",
  ],

  // Anti-patterns (with pointers to alternatives)
  when_not_to_use: [
    "TODO: case where this is wrong (use xxx instead)",
  ],

  // Known limitations (RTL, char length, screen ratio, etc.)
  limitations: [
    "TODO: list limits",
  ],

  inspired_by: "TODO: design source of inspiration",
  used_in: [],                   // real timeline paths that use this, fill later

  // ===== Compatibility (relationships) =====
  requires: [],                  // must pair with these component ids
  pairs_well_with: [],           // common good partners
  conflicts_with: [],            // cannot coexist with these
  alternatives: [],              // other choices for same need

  // ===== Visual weight (focus + layer + mood) =====
  visual_weight: "medium",       // light | medium | heavy
  z_layer: "${zLayer}",
  mood: ["calm"],                // calm | intense | playful | serious | professional | ...

  // ===== Index (tag search dimensions, CN + EN synonyms) =====
  tags: ["${id}", "${role}", "${theme}"],

  // ===== Engineering (complexity + performance + status + changelog) =====
  complexity: "simple",          // simple | medium | complex
  performance: { cost: "low", notes: "TODO: perf notes" },
  status: "experimental",        // experimental | beta | stable | deprecated
  changelog: [
    { version: "1.0.0", date: "${today}", change: "initial (scene-new generated)" },
  ],

  // ========================================
  // ===== Params contract (each needs type + semantic) =====
  // ========================================
  params: {
${paramsDefault}
  },

  // ===== Animation hooks (null or timeline animation name) =====
  enter: null,
  exit: null,

  // ========================================
  // ===== 3 functions =====
  // ========================================

  // ${mountComment}
  ${renderSignature} {
${renderBody}
  },

  // Structured state - lets AI know what's on-screen without reading pixels
  describe(_t, params, vp) {
    return {
      sceneId: "${id}",
      phase: "show",             // enter | hold | exit | hidden | show
      progress: 1,                // 0..1
      visible: true,
      params,
      elements: [
        // TODO: list logical elements currently on screen { type, role, value, ... }
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  // Sample params that actually run (used by CLI L2 disclosure, timeline authors copy this)
  sample() {
    return ${sampleDefault};
  },
};${escapeHelper}
`;
}

export async function run(argv: string[]): Promise<number> {
  const { flags } = parseFlags(argv);
  if (flags.help) { process.stdout.write(HELP); return 0; }

  const id = String(flags.id || "").trim();
  const role = String(flags.role || "").trim();
  const type = String(flags.type || "").trim();
  const ratio = String(flags.ratio || "").trim();
  const theme = String(flags.theme || "").trim();
  const name = String(flags.name || id).trim();
  const description = String(flags.description || `${role} component for ${theme}`).trim();
  const force = Boolean(flags.force);

  const errors: string[] = [];
  if (!/^[a-z][a-zA-Z0-9]*$/.test(id)) errors.push(`--id must be camelCase (got "${id}")`);
  if (!ROLES.includes(role as typeof ROLES[number])) errors.push(`--role must be one of: ${ROLES.join(", ")}`);
  if (!TYPES.includes(type as typeof TYPES[number])) errors.push(`--type must be one of: ${TYPES.join(", ")}`);
  if (!RATIOS.includes(ratio as typeof RATIOS[number])) errors.push(`--ratio must be one of: ${RATIOS.join(", ")}`);
  if (!theme) errors.push("--theme required");

  if (errors.length) {
    for (const e of errors) process.stderr.write(`error: ${e}\n`);
    process.stderr.write(`\nRun: nextframe scene-new --help\n`);
    return 1;
  }

  const themeDir = join(SCENES_ROOT, RATIO_DIRS[ratio], theme);
  if (!existsSync(themeDir)) {
    process.stderr.write(`error: theme dir does not exist: ${themeDir}\n`);
    process.stderr.write(`       create it first with a theme.md, then retry.\n`);
    return 1;
  }

  const fileName = `${role}-${id}.js`;
  const filePath = join(themeDir, fileName);
  if (existsSync(filePath) && !force) {
    process.stderr.write(`error: file already exists: ${filePath}\n`);
    process.stderr.write(`       pass --force to overwrite\n`);
    return 1;
  }

  const content = scaffold({ id, role, type, ratio, theme, name, description });
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);

  process.stdout.write(`✓ created ${filePath}\n`);
  process.stdout.write(`\nnext:\n`);
  process.stdout.write(`  1. Fill TODOs (intent >= 50 chars, params, render body, sample)\n`);
  process.stdout.write(`  2. node scripts/scene-smoke-test.mjs\n`);
  process.stdout.write(`  3. node src/nf-cli/bin/nextframe.js scenes | grep ${id}\n`);
  return 0;
}
