// nf-core-engine CLI — subcommands:
//   build <src> -o <out>
//   validate <src>
//   writeback <src> <edit-json>
// All output is a single JSON object on stdout. Errors go to stderr as JSON.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { compile, parseSource, resolveAnchors, writeBack } from "./index.js";

interface Args {
  cmd: string;
  positional: string[];
  output?: string;
  tracksDir?: string;
}

function parseArgs(argv: string[]): Args {
  const [cmd, ...rest] = argv;
  const args: Args = { cmd: cmd ?? "", positional: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "-o" || arg === "--output") {
      args.output = rest[i + 1];
      i += 1;
    } else if (arg === "--tracks-dir") {
      args.tracksDir = rest[i + 1];
      i += 1;
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
  if (!source || !a.output) return fail("usage: build <source> -o <output>");
  const text = readFileSync(source, "utf8");
  const result = compile(text, { tracksDir: a.tracksDir });
  mkdirSync(dirname(a.output), { recursive: true });
  writeFileSync(a.output, result.html, "utf8");
  emit({
    ok: true,
    source,
    output: a.output,
    bytes: result.bytes,
    anchors: Object.keys(result.resolved.anchors).length,
    tracks: result.resolved.tracks.length,
    warnings: result.warnings,
  });
  return 0;
}

function cmdValidate(a: Args): number {
  const source = a.positional[0];
  if (!source) return fail("usage: validate <source>");
  try {
    const ast = parseSource(readFileSync(source, "utf8"));
    const resolved = resolveAnchors(ast);
    emit({
      ok: true,
      anchors_resolved: Object.keys(resolved.anchors).length,
      tracks_count: resolved.tracks.length,
      errors: [],
      warnings: [],
    });
    return 0;
  } catch (e) {
    emit({ ok: false, errors: [(e as Error).message], warnings: [] });
    return 1;
  }
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
}

process.exit(main());
