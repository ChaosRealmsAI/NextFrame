import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

import { emit, parseFlags } from "../_helpers/_io.js";

type JsonRecord = Record<string, unknown>;

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  const timelinePath = positional[0];
  const action = typeof flags.action === "string" ? flags.action : positional[1];
  const layerValue = flags.layer;
  const layer = typeof layerValue === "string" ? Number(layerValue) : Number.NaN;

  if (!timelinePath || !isAbsolute(timelinePath) || !action || !Number.isInteger(layer) || layer < 0) {
    emit(
      {
        ok: false,
        error: {
          code: "USAGE",
          message: "usage: nextframe wysiwyg edit <timeline.json> --layer=N --action=<move|resize|edit-text> [--dx=N --dy=N --dw=N --dh=N --value=TEXT]",
          fix: "pass an absolute timeline.json path plus --layer and --action",
        },
      },
      flags,
    );
    return 3;
  }

  let rawText = "";
  let beforeTimeline: JsonRecord;
  try {
    rawText = await readFile(timelinePath, "utf8");
    beforeTimeline = JSON.parse(rawText) as JsonRecord;
  } catch (error: unknown) {
    emit(
      {
        ok: false,
        error: {
          code: "LOAD_FAIL",
          message: `cannot load ${timelinePath}: ${(error as Error).message}`,
          fix: "verify the path exists and contains valid JSON",
        },
      },
      flags,
    );
    return 2;
  }

  const edited = await runWysiwygEdit(rawText, { layer, action, flags });
  if (!edited.ok) {
    emit({ ok: false, error: edited.error }, flags);
    return 2;
  }

  const save = await atomicWriteJson(timelinePath, edited.value.timeline);
  if (!save.ok) {
    emit({ ok: false, error: save.error }, flags);
    return 2;
  }

  const before = edited.value.before ?? selectLayer(beforeTimeline, layer);
  const after = edited.value.after ?? selectLayer(edited.value.timeline, layer);
  emit(
    {
      ok: true,
      value: {
        ok: true,
        before,
        after,
      },
    },
    flags,
  );
  return 0;
}

async function runWysiwygEdit(
  rawTimeline: string,
  options: { layer: number; action: string; flags: Record<string, string | boolean> },
): Promise<
  | { ok: true; value: { before?: unknown; after?: unknown; timeline: JsonRecord } }
  | { ok: false; error: { code: string; message: string; fix?: string } }
> {
  const args = [
    "run",
    "-q",
    "-p",
    "nf-wysiwyg",
    "--bin",
    "nf-wysiwyg-edit",
    "--",
    `--layer=${options.layer}`,
    `--action=${options.action}`,
  ];
  for (const key of ["dx", "dy", "dw", "dh", "value"] as const) {
    const raw = options.flags[key];
    if (typeof raw === "string") args.push(`--${key}=${raw}`);
  }

  let child;
  try {
    child = spawn("cargo", args, { stdio: ["pipe", "pipe", "pipe"] });
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "SPAWN_FAIL",
        message: (error as Error).message,
        fix: 'verify "cargo" is installed and available in PATH',
      },
    };
  }

  child.stdin.end(rawTimeline, "utf8");

  let stdout = "";
  let stderr = "";
  let spawnError: Error | null = null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.on("error", (error: Error) => {
    spawnError = error;
  });

  const [exitCode] = await once(child, "close");
  if (spawnError) {
    return {
      ok: false,
      error: {
        code: "SPAWN_FAIL",
        message: spawnError.message,
        fix: 'verify "cargo" is installed and available in PATH',
      },
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stdout.trim() || "{}") as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      error: {
        code: "BAD_RESPONSE",
        message: stderr.trim() || "nf-wysiwyg-edit returned invalid JSON",
        fix: "rerun the command after cargo builds nf-wysiwyg-edit successfully",
      },
    };
  }

  if (exitCode !== 0 || parsed.ok !== true || !parsed.timeline || typeof parsed.timeline !== "object") {
    return {
      ok: false,
      error: {
        code: "EDIT_FAIL",
        message: typeof parsed.error === "string" ? parsed.error : (stderr.trim() || "edit failed"),
        fix: "verify the action flags and selected layer, then retry",
      },
    };
  }

  return {
    ok: true,
    value: {
      before: parsed.before,
      after: parsed.after,
      timeline: parsed.timeline as JsonRecord,
    },
  };
}

async function atomicWriteJson(
  targetPath: string,
  timeline: JsonRecord,
): Promise<{ ok: true } | { ok: false; error: { code: string; message: string; fix?: string } }> {
  const tempPath = join(dirname(targetPath), `.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  try {
    await writeFile(tempPath, JSON.stringify(timeline, null, 2) + "\n", "utf8");
    await rename(tempPath, targetPath);
    return { ok: true };
  } catch (error: unknown) {
    return {
      ok: false,
      error: {
        code: "SAVE_FAIL",
        message: (error as Error).message,
        fix: "verify the target directory is writable and on the same filesystem",
      },
    };
  }
}

function selectLayer(timeline: JsonRecord, index: number) {
  const layers = Array.isArray(timeline.layers) ? timeline.layers : [];
  return layers[index] ?? null;
}
