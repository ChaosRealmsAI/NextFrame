import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseFlags, emit } from "./_io.js";
import { run as appEval } from "./app-eval.js";

export async function run(argv) {
  const { flags } = parseFlags(argv);
  const outPath = flags.out || join(process.cwd(), "screenshot.png");

  // Step 1: Capture canvas to base64 PNG via app-eval
  const script = `
    var c = document.getElementById('render-canvas');
    if (c && c.width > 0 && c.height > 0) {
      var dataUrl = c.toDataURL('image/png');
      bridgeCall('fs.writeBase64', { path: '${outPath.replace(/'/g, "\\'")}', data: dataUrl });
      'captured ' + c.width + 'x' + c.height;
    } else {
      'no canvas or canvas empty';
    }
  `;

  const code = await appEval([script, "--timeout=5000"], { subcommand: "app-eval" });

  // Wait a bit for fs.writeBase64 IPC to complete
  await new Promise(r => setTimeout(r, 500));

  if (existsSync(outPath)) {
    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: true, path: outPath }, null, 2) + "\n");
    } else {
      process.stdout.write(`screenshot saved: ${outPath}\n`);
    }
    return 0;
  }

  emit({ ok: false, error: { code: "CAPTURE_FAILED", message: "screenshot not saved" } }, flags);
  return 2;
}
