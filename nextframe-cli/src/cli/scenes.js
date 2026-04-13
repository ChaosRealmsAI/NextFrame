import { parseFlags } from "./_io.js";
import { getScene, listScenes } from "../engine-v2/scenes.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  if (positional[0]) {
    const scene = getScene(positional[0]);
    if (!scene) {
      const error = { ok: false, error: { code: "UNKNOWN_SCENE", message: `unknown scene "${positional[0]}"` } };
      if (flags.json) {
        process.stdout.write(JSON.stringify(error, null, 2) + "\n");
      } else {
        process.stderr.write(`error: ${error.error.message}\n`);
      }
      return 2;
    }
    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: true, value: scene }, null, 2) + "\n");
    } else {
      process.stdout.write(`${scene.id} [${scene.type}] ${scene.name}\n`);
      process.stdout.write(`category: ${scene.category}\n`);
      process.stdout.write(`params: ${scene.params.length}\n`);
      for (const param of scene.params) {
        process.stdout.write(`  ${param.name} (${param.type}) default=${JSON.stringify(param.default)}\n`);
      }
    }
    return 0;
  }

  const scenes = listScenes();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: scenes }, null, 2) + "\n");
    return 0;
  }
  const grouped = new Map();
  for (const scene of scenes) {
    if (!grouped.has(scene.category)) grouped.set(scene.category, []);
    grouped.get(scene.category).push(scene);
  }
  process.stdout.write(`${scenes.length} scenes\n\n`);
  for (const [category, entries] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    process.stdout.write(`${category}\n`);
    for (const scene of entries) {
      process.stdout.write(`  ${scene.id.padEnd(18)} ${scene.name}\n`);
    }
  }
  return 0;
}
