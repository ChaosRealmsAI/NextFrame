import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseFlags, emit } from "./_io.js";

const CMD_PATH = join(tmpdir(), "nextframe-cmd.js");
const RESULT_PATH = join(tmpdir(), "nextframe-cmd-result.txt");

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const script = positional[0];

  if (!script) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe app-eval <js-expression>\n\nBuilt-in commands:\n  nextframe app-eval 'window.__diagnose()'\n  nextframe app-eval 'goProject(\"toolbox-demo\")'\n  nextframe app-eval 'goEditor(\"toolbox-demo\",\"ep01\",\"tools\")'\n  nextframe app-eval 'document.getElementById(\"render-canvas\").toDataURL(\"image/png\").substring(0,50)'" } }, flags);
    return 3;
  }

  // Clear old result
  try { unlinkSync(RESULT_PATH); } catch (_e) { /* ignore */ }

  // Write command
  writeFileSync(CMD_PATH, script);

  // Poll for result (max 10 seconds)
  const timeout = parseInt(flags.timeout, 10) || 10000;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, 200));
    if (existsSync(RESULT_PATH)) {
      const result = readFileSync(RESULT_PATH, "utf-8");
      try { unlinkSync(RESULT_PATH); } catch (_e) { /* ignore */ }

      if (flags.json) {
        try {
          const parsed = JSON.parse(result);
          process.stdout.write(JSON.stringify({ ok: true, result: parsed }, null, 2) + "\n");
        } catch (_e2) {
          process.stdout.write(JSON.stringify({ ok: true, result: result }, null, 2) + "\n");
        }
      } else {
        process.stdout.write(result + "\n");
      }
      return 0;
    }
  }

  emit({ ok: false, error: { code: "TIMEOUT", message: "no response from desktop app within " + timeout + "ms. Is shell running?" } }, flags);
  return 2;
}
