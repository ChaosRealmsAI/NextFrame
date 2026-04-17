// Run the ABI scanner across every official + user track.
// Emits a summary JSON line on stdout, exits non-zero on any violation.

import { readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const scannerUrl = pathToFileURL(resolve(here, "check-abi.mjs")).href;
const { scanTrack } = await import(scannerUrl);

import { readFileSync } from "node:fs";

function collectTracks() {
  const dirs = [resolve(root, "official"), resolve(root, "user")];
  const out = [];
  for (const d of dirs) {
    let entries;
    try {
      entries = readdirSync(d);
    } catch {
      continue;
    }
    for (const f of entries) {
      if (!f.endsWith(".js") || f === "loader.js") continue;
      const p = join(d, f);
      if (statSync(p).isFile()) out.push(p);
    }
  }
  return out;
}

const files = collectTracks();
const results = [];
let failed = 0;
for (const file of files) {
  const code = readFileSync(file, "utf8");
  const r = scanTrack(code);
  results.push({ file, ok: r.ok, violations: r.violations });
  if (!r.ok) failed += 1;
}

process.stdout.write(JSON.stringify({ ok: failed === 0, files_scanned: files.length, results }) + "\n");
process.exit(failed === 0 ? 0 : 1);
