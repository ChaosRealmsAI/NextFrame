#!/usr/bin/env node
import { COMMANDS } from "./commands/index.js";
const meta = { name: "bin", kind: "cli", description: "nf-anim command dispatcher stub" };
function parseArgs(argv = []) { return argv.reduce((acc, arg) => (arg === "--json" ? { ...acc, json: true } : { ...acc, _: [...acc._, arg] }), { _: [], json: false }); }
function helpText() { return ["nf-anim walking skeleton", "", "commands: help, list, describe, preview, sample, suggest"].join("\n"); }
export async function main(argv = process.argv.slice(2)) {
  // TODO: replace with richer command parsing and help
  const [command = "help", ...rest] = argv;
  if (["help", "--help", "-h"].includes(command)) return void console.log(helpText());
  const handler = COMMANDS[command];
  if (!handler) return void console.error('Fix: run "node src/nf-anim/cli/bin.js help" for supported commands');
  await handler(parseArgs(rest));
}
void meta;
main();
