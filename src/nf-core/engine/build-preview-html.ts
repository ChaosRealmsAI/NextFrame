// Preview HTML builder — turns a timeline JSON into a single-file runtime HTML.

import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { Timeline } from "../types.js";
import { buildHTML } from "./build.js";

function fail(message: string): never {
  throw new Error(`failed to build preview HTML: ${message}. Fix: verify the timeline JSON and referenced scene ids are valid.`);
}

async function main() {
  const [timelinePath, outputPath] = process.argv.slice(2);
  if (!timelinePath || !outputPath) {
    fail("usage is: node build-preview-html.js <timeline.json> <output.html>");
  }

  const timeline = JSON.parse(await readFile(timelinePath, "utf8")) as Timeline;
  await mkdir(path.dirname(outputPath), { recursive: true });
  const result = buildHTML(timeline, outputPath);
  if (!result?.ok) {
    fail(result?.error?.message || "unknown build error");
  }
}

main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${detail}\n`);
  process.exit(1);
});
