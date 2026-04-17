// Static + runtime scanner for Track ABI compliance.
//
// Rules enforced (static, AST-driven):
//   1. no-import           — no `import ... from` / `require(...)` inside the file
//   2. no-timers           — no setTimeout/setInterval/setImmediate/requestAnimationFrame
//   3. no-clock            — no Date.now / performance.now / new Date
//   4. no-random-unseeded  — no Math.random (unless the line carries // seeded marker)
//   5. no-storage          — no localStorage/sessionStorage/indexedDB
//   6. no-console-prod     — no console.<anything>
// Plus export-shape: describe / sample / render must be exported functions.
//
// CLI: `node scripts/check-abi.mjs <file.js>` -> single JSON line `{ok, violations}`.
// Programmatic: `scanTrack(code, { runtime?: mod }) -> { ok, violations }`.

import { readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { Parser } from "acorn";
import { simple as walkSimple } from "acorn-walk";
import { validateTrack } from "../abi/index.js";

const TIMER_NAMES = new Set([
  "setTimeout",
  "setInterval",
  "setImmediate",
  "requestAnimationFrame",
  "requestIdleCallback",
]);

const STORAGE_NAMES = new Set(["localStorage", "sessionStorage", "indexedDB"]);

const REQUIRED_EXPORTS = new Set(["describe", "sample", "render"]);

/**
 * Parse + scan a Track module source.
 * @param {string} code
 * @returns {{ok: boolean, violations: {rule:string, message:string, line:number}[]}}
 */
export function scanTrack(code) {
  const violations = [];
  let ast;
  try {
    ast = Parser.parse(code, {
      ecmaVersion: "latest",
      sourceType: "module",
      locations: true,
    });
  } catch (err) {
    return {
      ok: false,
      violations: [{ rule: "parse-error", message: String(err?.message ?? err), line: 0 }],
    };
  }

  const lines = code.split(/\r?\n/);
  const hasSeededComment = (line) => /\/\/\s*seeded\b/.test(lines[line - 1] ?? "");

  const exported = new Set();

  walkSimple(ast, {
    ImportDeclaration(node) {
      violations.push({
        rule: "no-import",
        message: `import statement not allowed in Track file: ${node.source.value}`,
        line: node.loc?.start.line ?? 0,
      });
    },
    CallExpression(node) {
      // require(...)
      if (node.callee.type === "Identifier" && node.callee.name === "require") {
        violations.push({
          rule: "no-import",
          message: "require() not allowed in Track file",
          line: node.loc?.start.line ?? 0,
        });
      }
      // setTimeout / setInterval / etc.
      if (node.callee.type === "Identifier" && TIMER_NAMES.has(node.callee.name)) {
        violations.push({
          rule: "no-timers",
          message: `timer API not allowed: ${node.callee.name}`,
          line: node.loc?.start.line ?? 0,
        });
      }
      // Math.random()
      if (
        node.callee.type === "MemberExpression" &&
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "Math" &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "random"
      ) {
        const line = node.loc?.start.line ?? 0;
        if (!hasSeededComment(line)) {
          violations.push({
            rule: "no-random-unseeded",
            message: "Math.random without // seeded marker on the same line",
            line,
          });
        }
      }
      // Date.now() / performance.now()
      if (
        node.callee.type === "MemberExpression" &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "now" &&
        node.callee.object.type === "Identifier" &&
        (node.callee.object.name === "Date" || node.callee.object.name === "performance")
      ) {
        violations.push({
          rule: "no-clock",
          message: `clock API not allowed: ${node.callee.object.name}.now()`,
          line: node.loc?.start.line ?? 0,
        });
      }
      // console.*
      if (
        node.callee.type === "MemberExpression" &&
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "console"
      ) {
        violations.push({
          rule: "no-console-prod",
          message: "console.* not allowed in Track file",
          line: node.loc?.start.line ?? 0,
        });
      }
    },
    NewExpression(node) {
      if (node.callee.type === "Identifier" && node.callee.name === "Date") {
        violations.push({
          rule: "no-clock",
          message: "new Date() not allowed in Track file",
          line: node.loc?.start.line ?? 0,
        });
      }
    },
    Identifier(node) {
      if (STORAGE_NAMES.has(node.name)) {
        violations.push({
          rule: "no-storage",
          message: `storage API not allowed: ${node.name}`,
          line: node.loc?.start.line ?? 0,
        });
      }
    },
    ExportNamedDeclaration(node) {
      if (node.declaration) {
        if (node.declaration.type === "FunctionDeclaration" && node.declaration.id) {
          exported.add(node.declaration.id.name);
        }
        if (node.declaration.type === "VariableDeclaration") {
          for (const d of node.declaration.declarations) {
            if (d.id.type === "Identifier") exported.add(d.id.name);
          }
        }
      }
      for (const spec of node.specifiers ?? []) {
        if (spec.exported.type === "Identifier") exported.add(spec.exported.name);
      }
    },
  });

  for (const name of REQUIRED_EXPORTS) {
    if (!exported.has(name)) {
      violations.push({
        rule: "export-shape",
        message: `missing required export: ${name}`,
        line: 0,
      });
    }
  }

  return { ok: violations.length === 0, violations };
}

async function main() {
  const target = process.argv[2];
  if (!target) {
    process.stdout.write(
      JSON.stringify({ ok: false, violations: [{ rule: "usage", message: "check-abi.mjs <file>", line: 0 }] }) + "\n",
    );
    process.exit(2);
  }
  const abs = isAbsolute(target) ? target : resolve(process.cwd(), target);
  const code = readFileSync(abs, "utf8");
  const staticResult = scanTrack(code);

  const runtimeViolations = [];
  if (staticResult.ok) {
    try {
      const mod = await import(pathToFileURL(abs).href);
      const rt = validateTrack(mod);
      if (!rt.ok) {
        for (const err of rt.errors) {
          runtimeViolations.push({ rule: "runtime", message: err, line: 0 });
        }
      }
    } catch (err) {
      runtimeViolations.push({
        rule: "runtime",
        message: `load failed: ${err?.message ?? String(err)}`,
        line: 0,
      });
    }
  }

  const violations = [...staticResult.violations, ...runtimeViolations];
  const ok = violations.length === 0;
  process.stdout.write(JSON.stringify({ ok, file: target, violations }) + "\n");
  process.exit(ok ? 0 : 1);
}

const invokedAsCli = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
if (invokedAsCli) {
  main().catch((err) => {
    process.stdout.write(
      JSON.stringify({ ok: false, violations: [{ rule: "crash", message: String(err?.stack ?? err), line: 0 }] }) + "\n",
    );
    process.exit(1);
  });
}
