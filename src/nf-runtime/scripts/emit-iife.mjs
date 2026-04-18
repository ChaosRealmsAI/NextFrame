#!/usr/bin/env node
// Emit nf-runtime as a standalone IIFE string → dist/runtime-iife.js
// Called by nf-core-engine during bundle (or by npm run build in nf-runtime).
//
// JSON-only stdout (rule-ai-operable).

import { getRuntimeSource } from "../src/index.js";
import { writeFileSync, mkdirSync, statSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { createHash } from "crypto";

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, "../dist/runtime-iife.js");

mkdirSync(dirname(out), { recursive: true });
const src = getRuntimeSource();
writeFileSync(out, src, "utf8");

const sha = createHash("sha256").update(src, "utf8").digest("hex");
process.stdout.write(
  JSON.stringify({
    event: "runtime.iife.built",
    path: out,
    bytes: statSync(out).size,
    sha256: sha,
  }) + "\n"
);
