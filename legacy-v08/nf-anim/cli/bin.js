#!/usr/bin/env node
import { COMMANDS } from "./commands/index.js";
import pkg from "../package.json" with { type: "json" };
const meta = {
  name: "bin",
  kind: "cli",
  description: "nf-anim command dispatcher",
};
function parseArgs(argv = []) {
  const out = { _: [], json: false, help: false, category: "" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") out.json = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else if (arg === "--category") out.category = argv[++i] || "";
    else if (arg.startsWith("--category=")) out.category = arg.slice(11);
    else out._.push(arg);
  }
  return out;
}
function helpPayload() {
  return {
    name: "nf-anim",
    version: pkg.version,
    commands: Object.keys(COMMANDS),
    examples: [
      "nf-anim list behaviors --json",
      "nf-anim describe behavior fadeIn --json",
      "nf-anim sample scene heartLike",
      "nf-anim preview",
      'nf-anim suggest "make a like reaction"',
    ],
  };
}
export async function main(argv = process.argv.slice(2)) {
  const [command = "help", ...rest] = argv;
  if (["help", "--help", "-h"].includes(command))
    return void console.log(JSON.stringify(helpPayload(), null, 2));
  const handler = COMMANDS[command];
  if (!handler) {
    process.exitCode = 1;
    console.error(
      'Fix: run "node src/nf-anim/cli/bin.js help" for supported commands',
    );
    return void console.log(JSON.stringify(helpPayload(), null, 2));
  }
  const flags = parseArgs(rest);
  if (flags.help)
    return void console.log(JSON.stringify(helpPayload(), null, 2));
  await handler(flags);
}
void meta;
main();
