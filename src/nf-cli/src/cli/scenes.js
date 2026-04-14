// nextframe scenes — list all available scenes (v0.3 engine-v2 registry).
// nextframe scenes <id> — show single scene details.
import { parseFlags } from "./_io.js";
import { listScenes, getScene } from "../engine-v2/registry.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);

  // Single scene detail: nextframe scenes <id>
  if (positional.length > 0) {
    const id = positional[0];
    const scene = getScene(id);
    if (!scene) {
      if (flags.json) process.stdout.write(JSON.stringify({ ok: false, error: { code: "UNKNOWN_SCENE", message: `no scene "${id}"` } }, null, 2) + "\n");
      else process.stderr.write(`error: no scene "${id}"\n`);
      return 2;
    }
    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: true, value: scene }, null, 2) + "\n");
    } else {
      process.stdout.write(`${scene.id} [${scene.type}] — ${scene.name}\n`);
      process.stdout.write(`  category: ${scene.category}\n`);
      if (Object.keys(scene.defaultParams).length > 0) {
        process.stdout.write(`  defaultParams: ${JSON.stringify(scene.defaultParams)}\n`);
      }
    }
    return 0;
  }

  // List all scenes
  const scenes = listScenes();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: scenes }, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(`${scenes.length} scenes available (v0.3 engine-v2)\n\n`);
  const byCategory = {};
  for (const s of scenes) {
    (byCategory[s.category] || (byCategory[s.category] = [])).push(s);
  }
  for (const [cat, items] of Object.entries(byCategory).sort()) {
    process.stdout.write(`  ${cat}:\n`);
    for (const s of items) {
      process.stdout.write(`    ${s.id.padEnd(22)} ${s.name}\n`);
    }
  }
  return 0;
}
