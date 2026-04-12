// nextframe scenes — list all available scenes with META.
import { parseFlags } from "./_io.js";
import { listScenes } from "../scenes/index.js";

export async function run(argv) {
  const { flags } = parseFlags(argv);
  const scenes = listScenes();
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: scenes }, null, 2) + "\n");
    return 0;
  }
  process.stdout.write(`${scenes.length} scenes available\n\n`);
  for (const s of scenes) {
    process.stdout.write(`  ${s.id.padEnd(20)} [${s.category}] ${s.description}\n`);
  }
  return 0;
}
