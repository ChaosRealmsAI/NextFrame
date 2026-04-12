import { readFileSync, existsSync, statSync } from "node:fs";
import { parseFlags, emit } from "./_io.js";

const LOG_PATH = "/tmp/nf-shell.log";

export async function run(argv) {
  const { flags } = parseFlags(argv);
  const logPath = flags.file || LOG_PATH;
  const tail = parseInt(flags.tail, 10) || 50;

  if (!existsSync(logPath)) {
    emit({ ok: false, error: { code: "NO_LOG", message: `log file not found: ${logPath}` } }, flags);
    return 2;
  }

  const content = readFileSync(logPath, "utf-8");
  const lines = content.split("\n").filter(Boolean);
  const lastLines = lines.slice(-tail);

  if (flags.json) {
    process.stdout.write(JSON.stringify({
      ok: true,
      path: logPath,
      totalLines: lines.length,
      lines: lastLines,
    }, null, 2) + "\n");
  } else {
    process.stdout.write(`=== ${logPath} (last ${lastLines.length} of ${lines.length} lines) ===\n`);
    process.stdout.write(lastLines.join("\n") + "\n");
  }
  return 0;
}
