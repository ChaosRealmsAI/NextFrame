// nf-core-engine CLI — `node dist/cli.js build <src> -o <out>`.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { compile } from "./index.js";

function parseArgs(argv: string[]): { cmd: string; source?: string; output?: string } {
  const [cmd, ...rest] = argv;
  const result: { cmd: string; source?: string; output?: string } = { cmd: cmd ?? "" };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "-o" || arg === "--output") {
      result.output = rest[i + 1];
      i += 1;
    } else if (!arg.startsWith("-") && !result.source) {
      result.source = arg;
    }
  }
  return result;
}

function main(): number {
  const { cmd, source, output } = parseArgs(process.argv.slice(2));
  if (cmd !== "build") {
    process.stderr.write(JSON.stringify({ ok: false, error: `unknown command: ${cmd}` }) + "\n");
    return 2;
  }
  if (!source || !output) {
    process.stderr.write(JSON.stringify({ ok: false, error: "usage: build <source> -o <output>" }) + "\n");
    return 2;
  }
  const text = readFileSync(source, "utf8");
  const result = compile(text);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, result.html, "utf8");
  process.stdout.write(
    JSON.stringify({ ok: true, source, output, bytes: result.bytes, warnings: result.warnings }) + "\n",
  );
  return 0;
}

process.exit(main());
