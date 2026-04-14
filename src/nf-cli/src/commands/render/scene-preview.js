// nextframe scene-preview <name> [--ratio=16:9]
// Opens the scene's preview.html in the default browser.

import { parseFlags } from "../_helpers/_io.js";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const RATIO_DIRS = { "16:9": "16x9", "9:16": "9x16", "4:3": "4x3" };
const CATEGORIES = ["backgrounds", "typography", "data", "shapes", "overlays", "media", "browser"];

const HELP = `nextframe scene-preview <name> [--ratio=16:9]

Open a scene's preview.html in the browser for visual verification.

This is a BLOCKING step — you must visually confirm:
  ✓ No content overflow
  ✓ Animation is smooth
  ✓ Text is readable
  ✓ Colors match theme

Example:
  nextframe scene-preview codeTerminal
  nextframe scene-preview codeTerminal --ratio=16:9
`;

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  if (flags.help || positional.length === 0) {
    process.stdout.write(HELP);
    return positional.length === 0 ? 3 : 0;
  }

  const name = positional[0];
  const ratio = flags.ratio || "16:9";
  const ratioDir = RATIO_DIRS[ratio];
  if (!ratioDir) {
    process.stderr.write(`error: unknown ratio "${ratio}"\n`);
    return 2;
  }

  const scenesRoot = resolve(fileURLToPath(import.meta.url), "../../../../../nf-core/scenes");

  // Search for the scene across categories
  let previewPath = null;
  for (const cat of CATEGORIES) {
    const candidate = resolve(scenesRoot, ratioDir, cat, name, "preview.html");
    if (existsSync(candidate)) {
      previewPath = candidate;
      break;
    }
  }

  if (!previewPath) {
    process.stderr.write(`error: no preview.html found for scene "${name}" in ${ratio}\n`);
    process.stderr.write(`Fix: run 'nextframe scene-new ${name} --ratio=${ratio} --category=<cat>' first\n`);
    return 2;
  }

  try {
    execSync(`open "${previewPath}"`, { stdio: "inherit" });
  } catch (e) {
    process.stderr.write(`error: could not open ${previewPath}\n`);
    return 2;
  }

  process.stdout.write(`✓ Opened: ${previewPath}

Verify in browser:
  ✓ No content overflow or clipping
  ✓ Animation plays smoothly (click Play)
  ✓ Drag scrubber to check all time points
  ✓ Text is readable, colors match theme

Next step:
  nextframe scene-validate ${name}
`);
  return 0;
}
