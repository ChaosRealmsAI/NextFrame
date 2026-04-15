// nextframe scene-validate <name> [--ratio=16:9]
// Runs validate-scene.js on a scene and reports pass/fail.

import { parseFlags } from "../_helpers/_io.js";
import { existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";

const RATIO_DIRS = { "16:9": "16x9", "9:16": "9x16", "4:3": "4x3" };
const CATEGORIES = ["backgrounds", "typography", "data", "shapes", "overlays", "media", "browser"];

const HELP = `nextframe scene-validate <name> [--ratio=16:9] [--json]

Validate a scene component against ADR-008 contract (16 checks).

Checks:
  1. index.js exists and imports
  2. meta has all required fields
  3. ratio matches directory
  4. params have type+default+label+semantic+group
  5. render() returns non-empty HTML
  6. screenshots() returns 3+ entries
  7. lint() returns {ok, errors}
  8. preview.html exists
  9. At least 3 themes
  10. AI metadata complete
  ... (16 total)

Example:
  nextframe scene-validate codeTerminal
  nextframe scene-validate flowDiagram --ratio=16:9 --json
`;

export async function run(argv: any) {
  const { positional, flags } = parseFlags(argv);
  if (flags.help || positional.length === 0) {
    process.stdout.write(HELP);
    return positional.length === 0 ? 3 : 0;
  }

  const name = positional[0];
  const ratio = flags.ratio || "16:9";
  const ratioDir = RATIO_DIRS[ratio];
  if (!ratioDir) {
    process.stderr.write(`error: unknown ratio "${ratio}"\n`);
    return 2;
  }

  const scenesRoot = resolve(dirname(createRequire(import.meta.url).resolve("nf-core/package.json")), "scenes");

  // Find scene directory
  let sceneDir = null;
  for (const cat of CATEGORIES) {
    const candidate = resolve(scenesRoot, ratioDir, cat, name);
    if (existsSync(resolve(candidate, "index.js"))) {
      sceneDir = candidate;
      break;
    }
  }

  if (!sceneDir) {
    for (const cat of CATEGORIES) {
      const catDir = resolve(scenesRoot, ratioDir, cat);
      if (!existsSync(catDir)) continue;
      const entries = readdirSync(catDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = resolve(catDir, entry.name);
        const indexPath = resolve(candidate, "index.js");
        if (!existsSync(indexPath)) continue;
        try {
          const mod = await import(`file://${indexPath}`);
          if (mod?.meta?.id === name) {
            sceneDir = candidate;
            break;
          }
        } catch {
          // Skip broken scenes while searching for an ID match.
        }
      }
      if (sceneDir) break;
    }
  }

  if (!sceneDir) {
    process.stderr.write(`error: scene "${name}" not found in ${ratio}\n`);
    return 2;
  }

  // Run validate-scene.js via child_process (it's a CLI tool that takes dir arg)
  const validateScript = resolve(scenesRoot, "validate-scene.js");
  if (existsSync(validateScript)) {
    const { execSync } = await import("node:child_process");
    try {
      const out = execSync(`node "${validateScript}" "${sceneDir}"`, { encoding: "utf-8", timeout: 15000 });
      process.stdout.write(`Scene: ${name} (${ratio})\nDir: ${sceneDir}\n\n`);
      try {
        const result = JSON.parse(out);
        if (flags.json) { process.stdout.write(JSON.stringify(result, null, 2) + "\n"); }
        else {
          if (result.ok) { process.stdout.write(`✓ All ${result.checks?.length || 0} checks passed\n`); }
          else {
            for (const e of result.errors || []) { process.stdout.write(`  ✗ ${e}\n`); }
            process.stdout.write(`\n${result.checks?.filter((c: any) => c.ok).length || 0}/${result.checks?.length || 0} passed — FIX REQUIRED\n`);
          }
        }
        return result.ok ? 0 : 1;
      } catch { process.stdout.write(out); return 0; }
    } catch (e) {
      process.stdout.write(`Scene: ${name} (${ratio})\nDir: ${sceneDir}\n\n`);
      const out = e.stdout || e.stderr || "";
      try {
        const result = JSON.parse(out);
        if (flags.json) { process.stdout.write(JSON.stringify(result, null, 2) + "\n"); }
        else {
          for (const e2 of result.errors || []) { process.stdout.write(`  ✗ ${e2}\n`); }
          process.stdout.write(`\n${result.checks?.filter((c: any) => c.ok).length || 0}/${result.checks?.length || 0} passed — FIX REQUIRED\n`);
        }
        return 1;
      } catch { process.stdout.write(out + "\n"); return 1; }
    }
  }

  // Fallback: manual validation (validate-scene.js not found)
  const checks: any = [];
  let passed = 0;
  let failed = 0;

  function check(label: any, ok: any, fix: any) {
    if (ok) { passed++; checks.push({ label, ok: true }); }
    else { failed++; checks.push({ label, ok: false, fix }); }
  }

  // 1. index.js exists
  const indexPath = resolve(sceneDir, "index.js");
  check("index.js exists", existsSync(indexPath), "create index.js");

  if (!existsSync(indexPath)) {
    process.stderr.write(`✗ index.js not found at ${indexPath}\n`);
    return 2;
  }

  const mod = await import(`file://${indexPath}`);

  // 2-3. meta exists and has required fields
  check("meta exported", !!mod.meta, "export const meta = {...}");
  if (mod.meta) {
    const m = mod.meta;
    check("meta.id", !!m.id, "add id field");
    check("meta.ratio", !!m.ratio, "add ratio field");
    check("meta.ratio matches dir", m.ratio === ratio, `meta.ratio="${m.ratio}" but dir is ${ratio}`);
    check("meta.category", !!m.category, "add category field");
    check("meta.description", !!m.description && m.description.length > 10, "description too short");
    check("meta.tags >= 3", Array.isArray(m.tags) && m.tags.length >= 3, "need at least 3 tags");
    check("meta.themes >= 3", m.themes && Object.keys(m.themes).length >= 3, "need at least 3 themes");
    check("meta.default_theme valid", m.themes && m.themes[m.default_theme] !== undefined, "default_theme not in themes");
    check("meta.ai complete", m.ai && m.ai.when && m.ai.how && m.ai.example && m.ai.avoid, "fill all ai fields");
    check("meta.params defined", !!m.params, "add params object");
    check("no TODO in description", !m.description.includes("TODO"), "remove TODO from description");
  }

  // 4. render exported
  check("render() exported", typeof mod.render === "function", "export function render(t, params, vp)");

  // 5. render returns HTML
  if (typeof mod.render === "function") {
    const html = mod.render(0, mod.meta?.ai?.example || {}, { width: 1920, height: 1080 });
    check("render() returns HTML", typeof html === "string" && html.length > 0, "render must return non-empty string");
  }

  // 6. screenshots
  check("screenshots() exported", typeof mod.screenshots === "function", "export function screenshots()");
  if (typeof mod.screenshots === "function") {
    const ss = mod.screenshots();
    check("screenshots >= 3", Array.isArray(ss) && ss.length >= 3, "need at least 3 screenshots");
  }

  // 7. lint
  check("lint() exported", typeof mod.lint === "function", "export function lint(params, vp)");

  // 8. preview.html
  check("preview.html exists", existsSync(resolve(sceneDir, "preview.html")), "create preview.html");

  // Report
  const total = passed + failed;
  if (flags.json) {
    process.stdout.write(JSON.stringify({ passed: failed === 0, total, passed: passed, failed, checks }, null, 2) + "\n");
  } else {
    process.stdout.write(`Scene: ${name} (${ratio})\nDir: ${sceneDir}\n\n`);
    for (const c of checks) {
      process.stdout.write(`  ${c.ok ? "✓" : "✗"} ${c.label}${c.fix ? " — Fix: " + c.fix : ""}\n`);
    }
    process.stdout.write(`\n${passed}/${total} passed${failed > 0 ? " — FIX REQUIRED" : " — ALL GOOD"}\n`);
    if (failed === 0) {
      process.stdout.write(`\nNext step: nextframe scene-preview ${name}\n`);
    }
  }
  return failed === 0 ? 0 : 1;
}
