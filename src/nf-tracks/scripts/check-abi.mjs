// Static + runtime scanner for Track ABI compliance.
// Usage: node scripts/check-abi.mjs <path/to/track.js>
// Emits a single JSON line on stdout.

import { readFileSync } from "node:fs";
import { resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { validateTrack } from "../abi/index.js";

async function main() {
  const target = process.argv[2];
  if (!target) {
    process.stdout.write(
      JSON.stringify({ ok: false, errors: ["usage: check-abi.mjs <file>"] }) + "\n",
    );
    process.exit(2);
  }
  const abs = isAbsolute(target) ? target : resolve(process.cwd(), target);
  const source = readFileSync(abs, "utf8");
  const staticErrors = [];
  if (/\bimport\s+[^;]*from\s+['"]/.test(source) && !source.includes("// abi-allow-import")) {
    staticErrors.push("Track file must have zero external imports (ABI rule)");
  }
  const mod = await import(pathToFileURL(abs).href);
  const check = validateTrack(mod);
  const ok = staticErrors.length === 0 && check.ok;
  const errors = [...staticErrors, ...check.errors];
  process.stdout.write(JSON.stringify({ ok, file: target, errors }) + "\n");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ ok: false, errors: [String(err?.stack ?? err)] }) + "\n");
  process.exit(1);
});
