// nextframe state-prompt <pipeline> [step] — 获取某条管线某步的完整提示词
// AI 读输出内容，按里面的命令操作。CLI 不做业务逻辑，只吐 MD。
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = resolve(HERE, "recipes");

function listPipelines() {
  try {
    return readdirSync(RECIPES_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function loadRecipe(pipeline) {
  const recipePath = resolve(RECIPES_DIR, pipeline, "recipe.json");
  try {
    return JSON.parse(readFileSync(recipePath, "utf8"));
  } catch {
    return null;
  }
}

function readMd(pipeline, filename) {
  const mdPath = resolve(RECIPES_DIR, pipeline, filename);
  try {
    return readFileSync(mdPath, "utf8");
  } catch {
    return null;
  }
}

function rootUsage() {
  const pipelines = listPipelines();
  const lines = [
    "state-prompt — AI 操作状态机。获取管线某步的完整提示词。",
    "",
    "Usage:",
    "  nextframe state-prompt <pipeline>          显示管线状态机指南",
    "  nextframe state-prompt <pipeline> <step>   获取某步的完整操作手册",
    "",
    "Pipelines:",
  ];
  for (const name of pipelines) {
    const recipe = loadRecipe(name);
    const desc = recipe?.description || "";
    lines.push(`  ${name.padEnd(14)} ${desc}`);
  }
  lines.push("");
  lines.push("Examples:");
  lines.push("  nextframe state-prompt produce           # 视频生产状态机指南");
  lines.push("  nextframe state-prompt produce ratio     # 定比例的操作手册");
  lines.push("  nextframe state-prompt produce pitfalls  # 已知坑合集");
  return lines.join("\n");
}

function pipelineUsage(pipeline, recipe) {
  const lines = [
    `${pipeline} — ${recipe.description || ""}`,
    "",
    `Usage: nextframe state-prompt ${pipeline} <step>`,
    "",
    "Steps:",
  ];
  for (const step of recipe.steps || []) {
    lines.push(`  ${step.id.padEnd(12)} ${step.title || ""}`);
  }
  lines.push(`  ${"pitfalls".padEnd(12)} 已知坑合集`);
  lines.push("");
  lines.push(`Guide: nextframe state-prompt ${pipeline}`);
  return lines.join("\n");
}

export async function run(argv) {
  const pipeline = (argv[0] || "").toLowerCase().replace(/^--/, "");
  const step = (argv[1] || "").toLowerCase().replace(/^--/, "");

  // 无参数 → 列出所有管线
  if (!pipeline || pipeline === "help") {
    process.stdout.write(rootUsage() + "\n");
    return 0;
  }

  // 检查管线存在
  const recipeDir = resolve(RECIPES_DIR, pipeline);
  if (!existsSync(recipeDir)) {
    process.stderr.write(`Unknown pipeline "${pipeline}". Run: nextframe state-prompt --help\n`);
    return 2;
  }

  const recipe = loadRecipe(pipeline);

  // 无 step → 输出管线指南
  if (!step) {
    const guide = readMd(pipeline, "guide.md");
    if (guide) {
      process.stdout.write(guide);
    } else if (recipe) {
      process.stdout.write(pipelineUsage(pipeline, recipe) + "\n");
    }
    return 0;
  }

  if (step === "help") {
    if (recipe) {
      process.stdout.write(pipelineUsage(pipeline, recipe) + "\n");
    }
    return 0;
  }

  // pitfalls 特殊处理
  if (step === "pitfalls") {
    const content = readMd(pipeline, "pitfalls.md");
    if (content) { process.stdout.write(content); return 0; }
    process.stderr.write(`No pitfalls file for "${pipeline}"\n`);
    return 2;
  }

  // 查找 step 对应的 MD 文件
  if (!recipe) {
    process.stderr.write(`Missing recipe.json for "${pipeline}"\n`);
    return 2;
  }

  const stepInfo = (recipe.steps || []).find((s) => s.id === step);
  if (!stepInfo) {
    process.stderr.write(`Unknown step "${step}" in pipeline "${pipeline}". Run: nextframe state-prompt ${pipeline} help\n`);
    return 2;
  }

  const content = readMd(pipeline, stepInfo.prompt);
  if (!content) {
    process.stderr.write(`Missing prompt file: ${stepInfo.prompt}\n`);
    return 2;
  }

  process.stdout.write(content);
  return 0;
}
