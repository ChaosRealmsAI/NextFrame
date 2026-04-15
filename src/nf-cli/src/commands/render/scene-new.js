// nextframe scene-new --id=<camelCase> --role=<role> --type=<type> --ratio=<ratio> --theme=<theme>
// Generates a scene v3 component scaffold: 11 required + 18 AI-understanding fields,
// type-correct render stub, inline comments.
import { parseFlags } from "../_helpers/_io.js";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __HERE = dirname(fileURLToPath(import.meta.url));
const SCENES_ROOT = resolve(__HERE, "../../../../nf-core/scenes");

const RATIOS = ["16:9", "9:16", "1:1", "4:3"];
const RATIO_DIRS = { "16:9": "16x9", "9:16": "9x16", "1:1": "1x1", "4:3": "4x3" };
const ROLES = ["bg", "chrome", "content", "text", "overlay", "data"];
const TYPES = ["canvas", "dom", "svg", "media"];

const HELP = `nextframe scene-new --id=<camelCase> --role=<role> --type=<type> --ratio=<ratio> --theme=<theme> [opts]

Generate a new scene component scaffold (scene v3 contract).

Required flags:
  --id          camelCase id (globally unique within theme)
  --role        bg | chrome | content | text | overlay | data
  --type        canvas | dom | svg | media
  --ratio       16:9 | 9:16 | 1:1 | 4:3
  --theme       theme name (must have existing theme.md)

Optional:
  --name "显示名"
  --description "一句话说明"
  --force       overwrite

Example:
  nextframe scene-new --id=chapterMark --role=overlay --type=dom --ratio=16:9 \\
    --theme=anthropic-warm --name="章节标记" --description="左上角章节编号 + 标题"
`;

function scaffold(o) {
    const { id, role, type, ratio, theme, name, description } = o;
    const today = new Date().toISOString().slice(0, 10);

    let sig, body, comment;
    if (type === "canvas") {
        sig = "render(ctx, _t, params, vp)";
        comment = "ctx is CanvasRenderingContext2D - fillRect / fillText / arc to draw";
        body = `    const W = vp.width;
    const H = vp.height;
    const color = params.color || "#f5ece0";
    const size = 48;

    ctx.fillStyle = color;
    ctx.font = \`600 \${size}px system-ui, -apple-system, "PingFang SC", sans-serif\`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(params.text || "", W * 0.5, H * 0.5);`;
    } else if (type === "dom") {
        sig = "render(host, _t, params, vp)";
        comment = "host is HTMLElement - use host.innerHTML or appendChild to mount";
        body = `    const color = params.color || "#f5ece0";
    const text = params.text || "";
    host.innerHTML = \`
      <div style="
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: \${vp.width * 0.6}px;
        padding: 48px;
        color: \${color};
        font: 600 40px/1.4 system-ui, -apple-system, 'PingFang SC', sans-serif;
        text-align: center;
      ">\${escapeHtml(text)}</div>
    \`;`;
    } else if (type === "svg") {
        sig = "render(host, _t, params, vp)";
        comment = "host is <svg> element - set innerHTML with SVG markup (works in jsdom and real DOM)";
        body = `    const color = params.color || "#da7756";
    host.innerHTML = \`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 \${vp.width} \${vp.height}" style="width:100%;height:100%">
        <circle cx="\${vp.width * 0.5}" cy="\${vp.height * 0.5}" r="100" fill="\${color}" />
      </svg>
    \`;`;
    } else {
        sig = "render(host, _t, params, vp)";
        comment = "host is a container HTMLElement - mount <video> / <img> / <audio>";
        body = `    host.innerHTML = \`
      <video src="\${params.src}" style="
        position: absolute;
        left: 0; top: 0;
        width: \${vp.width}px;
        height: \${vp.height}px;
        object-fit: cover;
      " autoplay muted></video>
    \`;`;
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
//   [ ] sample() returns realistic params
//   [ ] Run: node scripts/scene-smoke-test.mjs (from repo root)

export default {
  // ===== Identity =====
  id: "${id}",
  name: "${name}",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "${ratio}",
  theme: "${theme}",
  role: "${role}",

  // ===== Semantics =====
  description: "${description.replace(/"/g, '\\"')}",
  duration_hint: null,

  // ===== Render type =====
  type: "${type}",
  frame_pure: true,
  assets: ${assetsValue},

  // ===== AI understanding (18 fields) =====
  intent: \`
    TODO: write 50+ chars of real design reasoning. Not boilerplate.
    Explain why this layout / color / size / pairing / mood.
  \`,

  when_to_use: [
    "TODO: concrete scenario 1",
    "TODO: concrete scenario 2",
  ],

  when_not_to_use: [
    "TODO: anti-pattern (use xxx instead)",
  ],

  limitations: [
    "TODO: list limits (RTL / char length / screen ratio)",
  ],

  inspired_by: "TODO: design inspiration source",
  used_in: [],

  requires: [],
  pairs_well_with: [],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "medium",
  z_layer: "${zLayer}",
  mood: ["calm"],

  tags: ["${id}", "${role}", "${theme}"],

  complexity: "simple",
  performance: { cost: "low", notes: "TODO: perf notes" },
  status: "experimental",
  changelog: [
    { version: "1.0.0", date: "${today}", change: "initial (scene-new generated)" },
  ],

  // ===== Params =====
  params: {
${paramsDefault}
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  // ${comment}
  ${sig} {
${body}
  },

  describe(_t, params, vp) {
    return {
      sceneId: "${id}",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return ${sampleDefault};
  },
};${escapeHelper}
`;
}

export async function run(argv) {
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

    const errors = [];
    if (!/^[a-z][a-zA-Z0-9]*$/.test(id)) errors.push(`--id must be camelCase (got "${id}")`);
    if (!ROLES.includes(role)) errors.push(`--role must be one of: ${ROLES.join(", ")}`);
    if (!TYPES.includes(type)) errors.push(`--type must be one of: ${TYPES.join(", ")}`);
    if (!RATIOS.includes(ratio)) errors.push(`--ratio must be one of: ${RATIOS.join(", ")}`);
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
