import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import ttsFiller from "../../../../nf-core/anchors/fillers/tts.ts";
import { parseFlags } from "../_helpers/_io.js";

function defaultOutPath(input: string) {
  const ext = extname(input);
  const name = ext ? basename(input, ext) : basename(input);
  return join(dirname(input), `${name}.anchors.json`);
}

function printUsageError(message: string) {
  process.stderr.write(`error: ${message}\n`);
  process.stderr.write('Fix: run "nextframe anchors from-tts --help" for the expected arguments\n');
}

function printJson(pass: boolean, summary: string, issues: Array<Record<string, unknown>>, metadata: Record<string, unknown>) {
  process.stdout.write(JSON.stringify({
    pass,
    summary,
    issues,
    metadata: {
      tool: "anchors-from-tts",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      ...metadata,
    },
  }, null, 2) + "\n");
}

export async function run(argv: string[]): Promise<number> {
  const { positional, flags } = parseFlags(argv);
  const input = positional[0];
  if (!input) {
    printUsageError("missing <words.json> input");
    return 3;
  }

  const outPath = typeof flags.out === "string" ? flags.out : defaultOutPath(input);

  try {
    const dict = await ttsFiller(input);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(dict, null, 2) + "\n", "utf8");

    const summary = `wrote ${Object.keys(dict).length} anchors to ${outPath}`;
    if (flags.json) {
      printJson(true, summary, [], {
        outPath,
        input,
        addedCount: Object.keys(dict).length,
      });
    } else {
      process.stdout.write(summary + "\n");
    }
    return 0;
  } catch (error) {
    const message = (error as Error).message;
    if (flags.json) {
      printJson(false, `failed to generate anchors from ${input}`, [
        {
          severity: "error",
          code: message.split(":")[0] || "ANCHORS_FROM_TTS_FAILED",
          what: message,
          fix: "Check the words JSON path and payload shape, then rerun the command.",
        },
      ], { input, outPath });
    } else {
      process.stderr.write(`error: ${message}\n`);
      process.stderr.write("Fix: check the words JSON path and payload shape, then rerun the command\n");
    }
    return 2;
  }
}
