import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const CLI = resolve(ROOT, "bin/nextframe.js");

function runCli(args) {
  return spawnSync("node", [CLI, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 120_000,
  });
}

function registeredCommands() {
  const source = readFileSync(CLI, "utf8");
  const body = source.match(/const SUBCOMMANDS = \{([\s\S]*?)\n\};/)[1];
  return [...body.matchAll(/^[ \t]*(?:"([^"]+)"|([A-Za-z0-9_-]+)):\s*\(\) =>/gm)]
    .map((match) => match[1] || match[2]);
}

test("top-level help lists every registered command", () => {
  const result = runCli(["--help"]);
  assert.equal(result.status, 0, result.stderr);
  const commands = registeredCommands();
  for (const command of commands) {
    assert.match(result.stdout, new RegExp(`\\b${command}\\b`), `missing ${command} from top-level help`);
  }
});

test("every registered command exposes structured help", () => {
  const commands = registeredCommands();
  for (const command of commands) {
    const result = runCli([command, "--help"]);
    assert.equal(result.status, 0, `${command}: ${result.stderr || result.stdout}`);
    assert.match(result.stdout, /^.+ — .+/m, `${command}: missing summary`);
    assert.match(result.stdout, /^Usage:/m, `${command}: missing Usage section`);
    assert.match(result.stdout, /^Params:/m, `${command}: missing Params section`);
    assert.match(result.stdout, /^Examples:/m, `${command}: missing Examples section`);
    assert.match(result.stdout, /^Constraints:/m, `${command}: missing Constraints section`);
    assert.match(result.stdout, /^Fix:/m, `${command}: missing Fix section`);
  }
});

test("nested app subcommands expose structured help", () => {
  const nested = [
    ["app", "eval"],
    ["app", "screenshot"],
    ["app", "diagnose"],
    ["app", "navigate"],
    ["app", "click"],
    ["app", "status"],
    ["app-pipeline", "navigate"],
    ["app-pipeline", "tab"],
    ["app-pipeline", "status"],
    ["app-pipeline", "play"],
    ["app-pipeline", "stop"],
  ];

  for (const [command, subcommand] of nested) {
    const result = runCli([command, subcommand, "--help"]);
    assert.equal(result.status, 0, `${command} ${subcommand}: ${result.stderr || result.stdout}`);
    assert.match(result.stdout, /^Usage:/m, `${command} ${subcommand}: missing Usage section`);
    assert.match(result.stdout, /^Examples:/m, `${command} ${subcommand}: missing Examples section`);
    assert.match(result.stdout, /^Constraints:/m, `${command} ${subcommand}: missing Constraints section`);
  }
});

test("errors include Fix suggestions", () => {
  const unknown = runCli(["unknown-subcommand"]);
  assert.equal(unknown.status, 3, unknown.stderr || unknown.stdout);
  assert.match(unknown.stderr, /Fix:/);

  const usage = runCli(["build"]);
  assert.equal(usage.status, 3, usage.stderr || usage.stdout);
  assert.match(usage.stderr, /Fix:/);

  const sourceUsage = runCli(["source-download"]);
  assert.equal(sourceUsage.status, 1, sourceUsage.stderr || sourceUsage.stdout);
  assert.match(sourceUsage.stdout, /"fix":/);
});
