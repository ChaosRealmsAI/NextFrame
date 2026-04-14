// nextframe produce <step> — 输出视频生产管线某步的完整提示词
// AI 读输出内容，按里面的命令操作。CLI 不做业务逻辑，只吐 MD。
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RECIPE_DIR = resolve(HERE, "recipes/produce");

const STEPS = {
  ratio:    { file: "00-ratio.md",    title: "定比例" },
  check:    { file: "01-check.md",    title: "确认素材 + 检查组件" },
  scene:    { file: "02-scene.md",    title: "做组件 + 验证" },
  timeline: { file: "03-timeline.md", title: "写 Timeline JSON" },
  validate: { file: "04-validate.md", title: "参数门禁" },
  build:    { file: "05-build.md",    title: "Build + 截图审查" },
  record:   { file: "06-record.md",   title: "录制 MP4" },
  concat:   { file: "07-concat.md",   title: "多段拼接" },
  pitfalls: { file: "pitfalls.md",    title: "已知坑合集" },
};

function usage() {
  const lines = [
    "produce — 视频生产管线提示词。AI 跑一个 step，拿到完整操作手册。",
    "",
    "Usage: nextframe produce <step>",
    "",
    "Steps:",
  ];
  for (const [key, info] of Object.entries(STEPS)) {
    lines.push(`  ${key.padEnd(12)} ${info.title}`);
  }
  lines.push("");
  lines.push("Examples:");
  lines.push("  nextframe produce ratio       # 第一步：定比例");
  lines.push("  nextframe produce scene       # 做组件的完整操作手册");
  lines.push("  nextframe produce pitfalls    # 查看所有已知坑");
  lines.push("");
  lines.push("Flow: ratio → check → scene → timeline → validate → build → record → concat");
  return lines.join("\n");
}

export async function run(argv) {
  const step = (argv[0] || "").toLowerCase().replace(/^--/, "");

  if (step === "help") {
    process.stdout.write(usage() + "\n");
    return 0;
  }

  // 无参数 → 输出状态机指南
  if (!step) {
    const guidePath = resolve(RECIPE_DIR, "guide.md");
    try {
      process.stdout.write(readFileSync(guidePath, "utf8"));
      return 0;
    } catch {
      process.stdout.write(usage() + "\n");
      return 0;
    }
  }

  const info = STEPS[step];
  if (!info) {
    process.stderr.write(`Unknown step "${step}". Run: nextframe produce --help\n`);
    return 2;
  }

  const mdPath = resolve(RECIPE_DIR, info.file);
  try {
    const content = readFileSync(mdPath, "utf8");
    process.stdout.write(content);
    return 0;
  } catch {
    process.stderr.write(`Missing prompt file: ${mdPath}\n`);
    return 2;
  }
}
