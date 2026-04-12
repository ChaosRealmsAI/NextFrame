import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseFlags, emit } from "./_io.js";

const execAsync = promisify(exec);

export async function run(argv) {
  const { flags } = parseFlags(argv);
  const outPath = flags.out || join(process.cwd(), "debug-screenshot.png");

  // Use screencapture on macOS to capture the NextFrame window
  try {
    // Find the NextFrame window ID
    const { stdout: windowList } = await execAsync(
      `osascript -e 'tell application "System Events" to get the id of every window of every process whose name contains "shell"'`
    ).catch(() => ({ stdout: "" }));

    // Use screencapture with window selection
    // -l <windowid> captures specific window, -x no sound
    // Fallback: capture by app name using osascript
    const script = `
      osascript -e '
        tell application "System Events"
          set targetProc to first process whose name is "shell"
          set targetWin to first window of targetProc
          set {x, y} to position of targetWin
          set {w, h} to size of targetWin
        end tell
        do shell script "screencapture -R" & x & "," & y & "," & w & "," & h & " -x ${outPath.replace(/'/g, "'\\''")}"
      '
    `;

    await execAsync(script);

    if (existsSync(outPath)) {
      const result = { ok: true, path: outPath };
      if (flags.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      } else {
        process.stdout.write(`screenshot saved: ${outPath}\n`);
      }
      return 0;
    }

    emit({ ok: false, error: { code: "CAPTURE_FAILED", message: "screencapture did not produce output" } }, flags);
    return 2;
  } catch (err) {
    emit({ ok: false, error: { code: "CAPTURE_ERROR", message: err.message } }, flags);
    return 2;
  }
}
