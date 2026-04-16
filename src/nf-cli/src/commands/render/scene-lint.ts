// nextframe scene-lint --ratio=<r> --theme=<t> [--json]
//
// AST + regex 双通道扫描单主题全部组件，抓 17 坑中 AST 能抓到的 6 种硬错。
// AI 在 component verify 状态机里跑，作为交付前最后一道门。
//
// 检测规则：
//   L1  dom/svg/media 组件 render 含 @keyframes → CSS 动画在 compose 会消失
//   L2  ASCII "..." 嵌 " → JS 语法错（字符串提前闭合）
//   L3  frame_pure:true 但 render 实际读 t → recorder 会跳帧
//   L4  videoOverlay:true 组件但 render 没画 black box / no absolute pos → 槽位不对
//   L5  render 签名和 type 不匹配（type=dom 但 render(ctx,...)）
//   L6  intent 少于 50 字 → AI 理解不足
//
// 不阻断 git commit — 这是 AI 主动调用的质量检查工具。

import { parseFlags } from "../_helpers/_io.js";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../../..");
const SCENES_ROOT = resolve(REPO_ROOT, "src/nf-core/scenes");
const RATIO_DIRS: Record<string, string> = { "16:9": "16x9", "9:16": "9x16", "1:1": "1x1", "4:3": "4x3" };

const HELP = `nextframe scene-lint --ratio=<r> --theme=<t> [--json]

AST + regex lint 单主题全部 scene 组件，抓 6 种硬错。AI 在 component
verify 阶段必跑，作为交付前最后一道质量门。

Required:
  --ratio    16:9 | 9:16 | 1:1 | 4:3
  --theme    theme name

Optional:
  --json     输出机读 JSON（遵循 verify-contract.md schema）
  --file PATH  只 lint 单个文件（debug 用）

规则列表：
  L1  CSS @keyframes 在 render 里 → compose 架构下动画消失（pit 1）
  L2  ASCII "..." 嵌 "           → 字符串提前闭合（pit 6）
  L3  frame_pure:true 但读 t    → recorder 跳帧（pit 4）
  L4  videoOverlay:true 签名错  → 视频槽位不对（pit 11）
  L5  render 签名与 type 不匹配 → 参数错误
  L6  intent < 50 字             → 未来 AI 看不懂意图

Exit: 0 if no errors (warnings ok), 1 if any error.
`;

interface Issue {
  severity: "error" | "warning" | "info";
  code: string;
  file: string;
  line?: number;
  what: string;
  fix: string;
}

function extractRenderBody(source: string): { body: string; sigline: string; sigLineNo: number } | null {
  // Find: render(...) {  ...  },
  const m = source.match(/^\s*render\s*\(([^)]*)\)\s*\{/m);
  if (!m) return null;
  const sigStart = m.index || 0;
  const sigline = m[0];
  // Count lines before sig
  const sigLineNo = source.slice(0, sigStart).split("\n").length;
  // Balance braces to find end
  let i = sigStart + sigline.length;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === "{") depth++;
    else if (c === "}") depth--;
    i++;
  }
  return { body: source.slice(sigStart, i), sigline, sigLineNo };
}

function lintFile(filePath: string, content: string, meta: Record<string, unknown>): Issue[] {
  const issues: Issue[] = [];
  const rel = filePath.replace(REPO_ROOT + "/", "");
  const type = String(meta.type || "");
  const framePure = meta.frame_pure !== false;

  // L6: intent length
  const intent = String(meta.intent || "").trim();
  if (intent.length < 50) {
    issues.push({
      severity: "error", code: "INTENT_TOO_SHORT", file: rel,
      what: `intent 只有 ${intent.length} 字，要求 ≥ 50 字`,
      fix: "写真实的设计取舍（为什么这布局/为什么这颜色/在情绪波形哪段用），别套话",
    });
  }

  const renderInfo = extractRenderBody(content);
  if (!renderInfo) {
    issues.push({ severity: "error", code: "NO_RENDER", file: rel, what: "找不到 render 函数", fix: "scene 必须有 render 方法" });
    return issues;
  }
  const { body: renderBody, sigline, sigLineNo } = renderInfo;

  // L5: render signature vs type
  const firstParam = sigline.match(/render\s*\(\s*([A-Za-z_]\w*)/);
  const paramName = firstParam?.[1] || "";
  if (type === "canvas" && paramName !== "ctx") {
    issues.push({
      severity: "error", code: "SIG_MISMATCH", file: rel, line: sigLineNo,
      what: `type=canvas 但 render 第 1 参叫 "${paramName}"，应为 ctx`,
      fix: "canvas: render(ctx, t, params, vp)",
    });
  } else if ((type === "dom" || type === "svg" || type === "media") && paramName !== "host") {
    issues.push({
      severity: "error", code: "SIG_MISMATCH", file: rel, line: sigLineNo,
      what: `type=${type} 但 render 第 1 参叫 "${paramName}"，应为 host`,
      fix: `${type}: render(host, t, params, vp)`,
    });
  } else if (type === "motion" && paramName !== "host") {
    issues.push({
      severity: "error", code: "SIG_MISMATCH", file: rel, line: sigLineNo,
      what: `type=${type} 但 render 第 1 参叫 "${paramName}"，应为 host`,
      fix: `${type}: render(host, t, params, vp) → returns config object (see ADR-020)`,
    });
  }

  // L7 (v0.9 ADR-020): frame-pure runtime type forbids obvious non-deterministic APIs.
  if (type === "motion") {
    const forbidden = [
      [/\bsetInterval\s*\(/, "setInterval"],
      [/\bsetTimeout\s*\(/, "setTimeout"],
      [/\brequestAnimationFrame\s*\(/, "requestAnimationFrame"],
    ] as const;
    for (const [re, name] of forbidden) {
      if (re.test(renderBody)) {
        issues.push({
          severity: "error", code: "L7_NONDETERMINISTIC_API", file: rel, line: sigLineNo,
          what: `type=${type} forbids ${name}() — breaks frame-pure (ADR-020)`,
          fix: `All time flows via render's t parameter. Let gallery/recorder drive t externally.`,
        });
      }
    }
  }
  if (type === "motion") {
    if (/\bDate\.now\s*\(/.test(renderBody) || /\bperformance\.now\s*\(/.test(renderBody)) {
      issues.push({
        severity: "error", code: "L7_WALLCLOCK_IN_MOTION", file: rel, line: sigLineNo,
        what: `motion scene forbids Date.now/performance.now — breaks frame-pure (ADR-020)`,
        fix: `All values must flow from interp(track, t). No reading wall clock.`,
      });
    }
  }
  // L1: @keyframes in dom/svg/media render
  if ((type === "dom" || type === "svg" || type === "media") && /@keyframes\s+\w+/.test(renderBody)) {
    const kfLine = sigLineNo + renderBody.slice(0, renderBody.search(/@keyframes/)).split("\n").length - 1;
    issues.push({
      severity: "error", code: "CSS_KEYFRAMES_IN_RENDER", file: rel, line: kfLine,
      what: "render 里用了 @keyframes — compose 每帧 createElement 新 host，CSS 动画永不完成（pit 1）",
      fix: "改 t-driven：const p = Math.min(t/dur, 1); const opacity = 1-Math.pow(1-p, 3); 写入 inline style",
    });
  }

  // L3: frame_pure:true but render reads t
  if (framePure) {
    // Check if render body references t (not _t, not prefix)
    const readsT = /\bt\b(?!\s*=|_)/m.test(sigline) && !/\b_t\b/.test(sigline);
    // More careful: look inside body for /\bt\s*[+\-*/<>=]/ etc
    const tRead = /\b t\b\s*[-+*\/><=,;.)\]]/.test(renderBody) ||
                  /[-+*\/<>=(,;]\s*t\b/.test(renderBody) ||
                  /Math\.[a-z]+\(\s*t\b/.test(renderBody);
    if ((readsT || tRead) && !/render\s*\(\s*_t/.test(sigline)) {
      issues.push({
        severity: "warning", code: "FRAME_PURE_READS_T", file: rel, line: sigLineNo,
        what: "frame_pure:true 但 render 可能读了 t — recorder 会跳帧，动画不全",
        fix: "改 frame_pure:false，或把 render 参数命名为 _t 明示不读",
      });
    }
  }

  // L4: videoOverlay:true without black box styling
  if (meta.videoOverlay === true) {
    if (!/background\s*:\s*#000|background-color\s*:\s*(#000|rgb\(0,\s*0,\s*0)/i.test(renderBody) &&
        !/background\s*:\s*black/i.test(renderBody)) {
      issues.push({
        severity: "warning", code: "VIDEOOVERLAY_NO_BLACKBOX", file: rel, line: sigLineNo,
        what: "videoOverlay:true 但 render 没画黑色背景框 — 可能视频槽位不对（pit 11）",
        fix: "render 里画 <div style=\"background:#000;position:absolute;left:X;top:Y;...\"> 占位",
      });
    }
  }

  return issues;
}

function syntaxCheck(filePath: string): Issue | null {
  const result = spawnSync("node", ["--check", filePath], { encoding: "utf-8" });
  if (result.status === 0) return null;
  const stderr = String(result.stderr || "");
  // Parse node error: "/path/to/file.js:LINE" and message
  const lineMatch = stderr.match(/:(\d+)/);
  const msgMatch = stderr.match(/SyntaxError:\s*(.*)/);
  return {
    severity: "error", code: "SYNTAX_ERROR",
    file: filePath.replace(REPO_ROOT + "/", ""),
    line: lineMatch ? Number(lineMatch[1]) : undefined,
    what: `语法错：${msgMatch?.[1] || stderr.slice(0, 120)}`,
    fix: "常见原因：中文字符串嵌 ASCII \" 导致字符串提前闭合（pit 6）。改 『』 或转义。",
  };
}

export async function run(argv: string[]): Promise<number> {
  const { flags } = parseFlags(argv);
  if (flags.help) { process.stdout.write(HELP); return 0; }

  const ratio = String(flags.ratio || "").trim();
  const theme = String(flags.theme || "").trim();
  const asJson = Boolean(flags.json);
  const singleFile = flags.file ? String(flags.file) : null;

  if (!(ratio in RATIO_DIRS) || !theme) {
    process.stderr.write(`error: --ratio --theme required\nrun: nextframe scene-lint --help\n`);
    return 1;
  }

  const themeDir = join(SCENES_ROOT, RATIO_DIRS[ratio], theme);
  if (!existsSync(themeDir)) {
    process.stderr.write(`error: theme dir not found: ${themeDir}\n`);
    return 1;
  }

  const files = singleFile
    ? [singleFile]
    : readdirSync(themeDir).filter(f => f.endsWith(".js") && !f.startsWith("_")).map(f => join(themeDir, f));

  const allIssues: Issue[] = [];
  for (const path of files) {
    // L2: syntax check via node --check (catches ASCII quote nesting bugs)
    const syntaxIssue = syntaxCheck(path);
    if (syntaxIssue) {
      allIssues.push(syntaxIssue);
      continue; // can't AST-parse if syntax broken
    }
    try {
      const content = readFileSync(path, "utf-8");
      const mod = await import(pathToFileURL(path).href) as { default?: Record<string, unknown> };
      const meta = mod.default;
      if (!meta) continue;
      allIssues.push(...lintFile(path, content, meta));
    } catch (e) {
      allIssues.push({
        severity: "error", code: "LOAD_FAIL", file: path.replace(REPO_ROOT + "/", ""),
        what: `加载失败: ${(e as Error).message}`, fix: "检查 node --check <file>",
      });
    }
  }

  const errorCount = allIssues.filter(i => i.severity === "error").length;
  const warnCount = allIssues.filter(i => i.severity === "warning").length;

  if (asJson) {
    process.stdout.write(JSON.stringify({
      pass: errorCount === 0,
      score: Math.max(0, 100 - errorCount * 20 - warnCount * 5),
      summary: `${files.length} files · ${errorCount} errors · ${warnCount} warnings`,
      issues: allIssues,
      metadata: { tool: "scene-lint", version: "1.0.0", timestamp: new Date().toISOString() },
    }, null, 2) + "\n");
  } else {
    const byFile: Record<string, Issue[]> = {};
    for (const i of allIssues) (byFile[i.file] || (byFile[i.file] = [])).push(i);
    for (const [file, issues] of Object.entries(byFile)) {
      process.stdout.write(`\n${file}\n`);
      for (const i of issues) {
        const badge = i.severity === "error" ? "✗" : i.severity === "warning" ? "⚠" : "ℹ";
        process.stdout.write(`  ${badge} [${i.code}${i.line ? ` L${i.line}` : ""}] ${i.what}\n`);
        process.stdout.write(`     → ${i.fix}\n`);
      }
    }
    const status = errorCount === 0 ? "✓ pass" : "✗ fail";
    process.stdout.write(`\n${status} · ${files.length} files · ${errorCount} errors · ${warnCount} warnings\n`);
  }

  return errorCount > 0 ? 1 : 0;
}
