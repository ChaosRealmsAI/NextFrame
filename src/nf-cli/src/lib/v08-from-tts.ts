import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";

import ttsFiller from "../../../nf-core/anchors/fillers/tts.ts";
import { parseFlags } from "../commands/_helpers/_io.js";

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

function extractOutput(argv: string[]) {
  const cleaned = [];
  let outputPath = null;
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--out" || argv[i] === "--output") && i + 1 < argv.length) {
      outputPath = argv[i + 1];
      i++;
    } else {
      cleaned.push(argv[i]);
    }
  }
  return { cleaned, outputPath };
}

function fail(code: string, message: string): never {
  throw new Error(`${code}: ${message}`);
}

function finiteMs(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail("BAD_TTS_PAYLOAD", `field "${field}" must be a finite number >= 0`);
  }
  return value;
}

function coerceMs(
  primary: unknown,
  secondary: unknown,
  primaryField: string,
  secondaryField: string,
) {
  if (primary !== undefined) {
    return finiteMs(primary, primaryField);
  }
  return finiteMs(secondary, secondaryField);
}

async function buildAnchorsFromSnakeCasePayload(input: string) {
  const payload = JSON.parse(await readFile(input, "utf8")) as {
    segments?: Array<{
      id?: string;
      start_ms?: number;
      end_ms?: number;
      startMs?: number;
      endMs?: number;
      words?: Array<{
        word?: string;
        w?: string;
        start_ms?: number;
        end_ms?: number;
        startMs?: number;
        endMs?: number;
        s?: number;
        e?: number;
      }>;
    }>;
  };

  if (!Array.isArray(payload.segments)) {
    fail("BAD_TTS_PAYLOAD", 'missing "segments" array');
  }

  const dict: Record<string, { at: number; label?: string }> = {};
  payload.segments.forEach((segment, segmentIndex) => {
    if (!segment || typeof segment.id !== "string" || !segment.id.trim()) {
      fail("BAD_TTS_PAYLOAD", `segments[${segmentIndex}].id must be a non-empty string`);
    }

    const startMs = coerceMs(
      segment.startMs,
      segment.start_ms,
      `segments[${segmentIndex}].startMs`,
      `segments[${segmentIndex}].start_ms`,
    );
    const endMs = coerceMs(
      segment.endMs,
      segment.end_ms,
      `segments[${segmentIndex}].endMs`,
      `segments[${segmentIndex}].end_ms`,
    );
    dict[`${segment.id}.begin`] = { at: startMs };
    dict[`${segment.id}.end`] = { at: endMs };

    if (!Array.isArray(segment.words)) {
      return;
    }

    segment.words.forEach((word, wordIndex) => {
      const begin = coerceMs(
        word?.s ?? word?.startMs,
        word?.start_ms,
        `segments[${segmentIndex}].words[${wordIndex}].s`,
        `segments[${segmentIndex}].words[${wordIndex}].start_ms`,
      );
      const end = coerceMs(
        word?.e ?? word?.endMs,
        word?.end_ms,
        `segments[${segmentIndex}].words[${wordIndex}].e`,
        `segments[${segmentIndex}].words[${wordIndex}].end_ms`,
      );
      const label = typeof word?.w === "string" ? word.w : word?.word;
      dict[`${segment.id}.w${wordIndex}.begin`] = { at: begin, label };
      dict[`${segment.id}.w${wordIndex}.end`] = { at: end, label };
    });
  });

  return dict;
}

export async function runAnchorsFromTts(argv: string[]): Promise<number> {
  const { cleaned, outputPath: splitOutput } = extractOutput(argv);
  const { positional, flags } = parseFlags(cleaned);
  const input = positional[0];
  if (!input) {
    printUsageError("missing <words.json> input");
    return 3;
  }

  const outPath = splitOutput
    || (typeof flags.out === "string" ? flags.out : null)
    || (typeof flags.output === "string" ? flags.output : null)
    || defaultOutPath(input);

  try {
    let dict;
    try {
      dict = await ttsFiller(input);
    } catch (error) {
      const message = (error as Error).message || "";
      if (!message.startsWith("BAD_TTS_PAYLOAD:")) {
        throw error;
      }
      dict = await buildAnchorsFromSnakeCasePayload(input);
    }

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
