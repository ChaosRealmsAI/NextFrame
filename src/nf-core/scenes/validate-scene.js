#!/usr/bin/env node
// Scene validator CLI — checks scene component contracts (render, describe, defaults, validate)
/**
 * Scene 验证工具 — AI 在开发和使用阶段都用这个自检。
 *
 * 用法:
 *   node validate-scene.js <scene-dir> [--params '{"hueA":180}']
 *
 * 检查项:
 *   1. index.js 存在且能 import
 *   2. meta 字段完整（id, ratio, category, params, description, tech, duration_hint）
 *   3. ratio 和目录层级一致
 *   4. render() 是函数且能调用
 *   5. screenshots() 存在且返回数组
 *   6. lint() 存在且通过
 *   7. preview.html 存在
 *   8. render() 返回的 HTML 不为空
 *   9. 所有 params 有 default
 *
 * 输出 JSON:
 *   { ok: true/false, checks: [...], errors: [...], screenshots: [...] }
 */

import { pathToFileURL } from "url";
import { existsSync } from "fs";
import { resolve, basename, dirname } from "path";

const RATIOS = { "16x9": "16:9", "9x16": "9:16", "4x3": "4:3" };
const REQUIRED_META = ["id", "ratio", "category", "description", "tech", "duration_hint", "params"];

async function main() {
  const sceneDir = resolve(process.argv[2] || ".");
  const paramsArg = process.argv.find((a) => a.startsWith("--params"));
  const userParams = paramsArg ? JSON.parse(process.argv[process.argv.indexOf(paramsArg) + 1]) : {};

  const checks = [];
  const errors = [];
  const pass = (name) => checks.push({ name, ok: true });
  const fail = (name, msg) => { checks.push({ name, ok: false, error: msg }); errors.push(msg); };

  // 1. index.js 存在
  const indexPath = resolve(sceneDir, "index.js");
  if (!existsSync(indexPath)) { fail("index.js", `${indexPath} 不存在`); return output(false, checks, errors); }
  pass("index.js exists");

  // 2. import
  let mod;
  try {
    mod = await import(pathToFileURL(indexPath).href);
  } catch (e) {
    fail("import", `import 失败: ${e.message}`);
    return output(false, checks, errors);
  }
  pass("import ok");

  const { meta, render, screenshots, lint } = mod;

  // 3. meta 完整
  if (!meta) { fail("meta", "meta 未导出"); return output(false, checks, errors); }
  for (const field of REQUIRED_META) {
    if (meta[field] === undefined) fail(`meta.${field}`, `meta.${field} 缺失`);
    else pass(`meta.${field}`);
  }

  // 4. ratio 和目录一致
  const dirParts = sceneDir.split("/");
  const ratioDir = dirParts.find((p) => RATIOS[p]);
  if (ratioDir) {
    const expectedRatio = RATIOS[ratioDir];
    if (meta.ratio !== expectedRatio) fail("ratio-match", `meta.ratio="${meta.ratio}" 但目录是 ${ratioDir}(${expectedRatio})`);
    else pass("ratio-match");
  } else {
    fail("ratio-dir", "目录路径中没有找到比例层级 (16x9/9x16/4x3)");
  }

  // 5. params 都有 default
  if (meta.params && typeof meta.params === "object") {
    for (const [key, spec] of Object.entries(meta.params)) {
      if (spec.default === undefined && !spec.required) {
        fail(`param.${key}.default`, `参数 ${key} 没有 default 且不是 required`);
      }
    }
    pass("params defaults");
  }

  // 6. render 是函数
  if (typeof render !== "function") { fail("render", "render 不是函数"); }
  else {
    const ratio = meta.ratio || "9:16";
    const vp = ratio === "16:9" ? { width: 1920, height: 1080 } : ratio === "4:3" ? { width: 1440, height: 1080 } : { width: 1080, height: 1920 };
    const mergedParams = {};
    for (const [k, v] of Object.entries(meta.params || {})) mergedParams[k] = userParams[k] !== undefined ? userParams[k] : v.default;
    try {
      const html = render(0, mergedParams, vp);
      if (!html || html.trim().length === 0) fail("render-output", "render(0) 返回空 HTML");
      else { pass("render ok"); pass(`render-length: ${html.length} chars`); }
    } catch (e) {
      fail("render-error", `render(0) 抛异常: ${e.message}`);
    }
  }

  // 7. screenshots 接口
  if (typeof screenshots !== "function") { fail("screenshots", "screenshots 未导出"); }
  else {
    const shots = screenshots();
    if (!Array.isArray(shots) || shots.length === 0) fail("screenshots-output", "screenshots() 返回空数组");
    else {
      for (const s of shots) {
        if (typeof s.t !== "number") fail("screenshot.t", `截图时间 t 不是数字: ${JSON.stringify(s)}`);
        if (!s.label) fail("screenshot.label", `截图缺少 label: ${JSON.stringify(s)}`);
      }
      pass(`screenshots: ${shots.length} 个时间点`);
    }
  }

  // 8. lint 接口
  if (typeof lint !== "function") { fail("lint", "lint 未导出"); }
  else {
    const ratio = meta.ratio || "9:16";
    const vp = ratio === "16:9" ? { width: 1920, height: 1080 } : ratio === "4:3" ? { width: 1440, height: 1080 } : { width: 1080, height: 1920 };
    const mergedParams = {};
    for (const [k, v] of Object.entries(meta.params || {})) mergedParams[k] = userParams[k] !== undefined ? userParams[k] : v.default;
    try {
      const result = lint(mergedParams, vp);
      if (result.ok) pass("lint passed");
      else { for (const e of result.errors) fail("lint", e); }
    } catch (e) {
      fail("lint-error", `lint() 抛异常: ${e.message}`);
    }
  }

  // 9. preview.html 存在
  if (existsSync(resolve(sceneDir, "preview.html"))) pass("preview.html exists");
  else fail("preview.html", "preview.html 不存在");

  output(errors.length === 0, checks, errors, typeof screenshots === "function" ? screenshots() : []);
}

function output(ok, checks, errors, screenshotTimes) {
  const result = { ok, total: checks.length, passed: checks.filter((c) => c.ok).length, failed: errors.length, checks, errors };
  if (screenshotTimes) result.screenshot_times = screenshotTimes;
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  process.exit(ok ? 0 : 1);
}

main();
