// nf-core-engine CLI — subcommands:
//   build <src> -o <out> [--tracks-dir D] [--resolve-only]
//   validate <src>
//   writeback <src> <edit-json>
// All output is a single JSON object on stdout. Errors go to stderr as JSON.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { compile, parseSource, resolveAnchors, validateSource, writeBack } from "./index.js";

interface Args {
  cmd: string;
  positional: string[];
  output?: string;
  tracksDir?: string;
  resolveOnly: boolean;
}

function parseArgs(argv: string[]): Args {
  const [cmd, ...rest] = argv;
  const args: Args = { cmd: cmd ?? "", positional: [], resolveOnly: false };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "-o" || arg === "--output" || arg === "--out") {
      args.output = rest[i + 1];
      i += 1;
    } else if (arg === "--tracks-dir") {
      args.tracksDir = rest[i + 1];
      i += 1;
    } else if (arg === "--resolve-only") {
      args.resolveOnly = true;
    } else if (arg && !arg.startsWith("-")) {
      args.positional.push(arg);
    }
  }
  return args;
}

function emit(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function fail(msg: string, code = 2): number {
  process.stderr.write(JSON.stringify({ ok: false, error: msg }) + "\n");
  return code;
}

function cmdBuild(a: Args): number {
  const source = a.positional[0];
  if (!source || !a.output) return fail("usage: build <source> -o <output> [--resolve-only]");
  const text = readFileSync(source, "utf8");
  mkdirSync(dirname(a.output), { recursive: true });
  if (a.resolveOnly) {
    const ast = parseSource(text);
    const resolved = resolveAnchors(ast);
    const payload = JSON.stringify(resolved, null, 2) + "\n";
    writeFileSync(a.output, payload, "utf8");
    emit({
      ok: true,
      mode: "resolve-only",
      source,
      output: a.output,
      bytes: payload.length,
      anchors: Object.keys(resolved.anchors).length,
      tracks: resolved.tracks.length,
    });
    return 0;
  }
  const result = compile(text, { tracksDir: a.tracksDir, sourcePath: source });
  writeFileSync(a.output, result.html, "utf8");
  emit({
    ok: true,
    mode: "bundle",
    source,
    output: a.output,
    bytes: result.bytes,
    anchors: Object.keys(result.resolved.anchors).length,
    tracks: result.resolved.tracks.length,
    tracks_included: result.tracks_included,
    assets_inlined: result.assets_inlined,
    warnings: result.warnings,
  });
  return 0;
}

function cmdValidate(a: Args): number {
  const source = a.positional[0];
  if (!source) return fail("usage: validate <source>");
  const text = readFileSync(source, "utf8");
  const report = validateSource(text);
  emit(report);
  return report.ok ? 0 : 1;
}

function cmdWriteBack(a: Args): number {
  const source = a.positional[0];
  const editPath = a.positional[1];
  if (!source || !editPath) return fail("usage: writeback <source> <edit-json>");
  const text = readFileSync(source, "utf8");
  const edit = JSON.parse(readFileSync(editPath, "utf8"));
  const result = writeBack(text, edit);
  emit({ ok: true, output: result.output, diff: result.diff, stable: result.stable });
  return 0;
}

function main(): number {
  const a = parseArgs(process.argv.slice(2));
  try {
    switch (a.cmd) {
      case "build":
        return cmdBuild(a);
      case "validate":
        return cmdValidate(a);
      case "writeback":
        return cmdWriteBack(a);
      default:
        return fail(`unknown command: ${a.cmd}`);
    }
  } catch (e) {
    return fail((e as Error).message);
  }
}

process.exit(main());
