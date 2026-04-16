#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entry = resolve(__dirname, "../src/index.ts");
const tsx = resolve(__dirname, "../node_modules/.bin/tsx");
const hasLocalTsx = existsSync(tsx);

const child = spawn(hasLocalTsx ? tsx : "npx", hasLocalTsx
  ? [entry, ...process.argv.slice(2)]
  : ["--yes", "tsx", entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
