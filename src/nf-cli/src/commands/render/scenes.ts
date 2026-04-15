// nextframe scenes — list available scenes from nf-core/scenes/ auto-discovery.
// nextframe scenes <id> — show single scene details.
import { parseFlags } from "../_helpers/_io.js";
import { listScenes, getScene } from "../_helpers/_scene-registry.js";

export async function run(argv: any) {
  const { positional, flags } = parseFlags(argv);

  // Single scene detail
  if (positional.length > 0) {
    const id = positional[0];
    const scene = await getScene(id);
    if (!scene) {
      if (flags.json) process.stdout.write(JSON.stringify({ ok: false, error: { code: "UNKNOWN_SCENE", message: `no scene "${id}"` } }, null, 2) + "\n");
      else process.stderr.write(`error: no scene "${id}"\nFix: run 'nextframe scenes' to see available ids\n`);
      return 2;
    }
    const meta = scene.META || scene;
    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: true, value: meta }, null, 2) + "\n");
    } else {
      process.stdout.write(`${meta.id} [${meta.tech}] — ${meta.label}\n`);
      process.stdout.write(`  ratio: ${meta.ratio}\n`);
      process.stdout.write(`  category: ${meta.category}\n`);
      process.stdout.write(`  description: ${meta.description}\n`);
      process.stdout.write(`  duration_hint: ${meta.duration_hint}s\n`);
      if (meta.loopable) process.stdout.write(`  loopable: true\n`);
      if (meta.tags) process.stdout.write(`  tags: ${meta.tags.join(", ")}\n`);
      if (meta.themes) process.stdout.write(`  themes: ${Object.keys(meta.themes).join(", ")}\n`);
      if (meta.params) {
        process.stdout.write(`  params:\n`);
        for (const [k, v] of Object.entries(meta.params)) {
          const def = v.default !== undefined ? ` = ${JSON.stringify(v.default)}` : " (required)";
          const range = v.range ? ` [${v.range[0]}..${v.range[1]}]` : "";
          process.stdout.write(`    ${k}: ${v.type}${def}${range} — ${v.label}\n`);
        }
      }
      if (meta.ai) {
        process.stdout.write(`  ai.when: ${meta.ai.when}\n`);
        if (meta.ai.avoid) process.stdout.write(`  ai.avoid: ${meta.ai.avoid}\n`);
      }
    }
    return 0;
  }

  // List all scenes
  let scenes = await listScenes();

  // Filter by --ratio
  if (flags.ratio) {
    scenes = scenes.filter((s: any) => s.ratio === flags.ratio);
  }

  // Filter by --search (case-insensitive partial match across id/label/description/tags/mood/theme)
  if (flags.search) {
    const q = String(flags.search).toLowerCase();
    scenes = scenes.filter((s: any) => {
      const fields = [
        s.id,
        s.label,
        s.description,
        ...(Array.isArray(s.tags) ? s.tags : []),
        ...(Array.isArray(s.mood) ? s.mood : []),
        ...(s.themes ? Object.keys(s.themes) : []),
      ];
      return fields.some((f) => f && String(f).toLowerCase().includes(q));
    });
  }

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value: scenes }, null, 2) + "\n");
    return 0;
  }

  const filterDesc = [];
  if (flags.search) filterDesc.push(`search="${flags.search}"`);
  if (flags.ratio) filterDesc.push(`ratio=${flags.ratio}`);
  const suffix = filterDesc.length ? ` (${filterDesc.join(", ")})` : "";
  process.stdout.write(`${scenes.length} scenes available${suffix}\n\n`);

  const byCategory = {};
  for (const s of scenes) {
    (byCategory[s.category] || (byCategory[s.category] = [])).push(s);
  }
  for (const [cat, items] of Object.entries(byCategory).sort()) {
    process.stdout.write(`  ${cat}:\n`);
    for (const s of items) {
      const ratio = s.ratio || "?";
      process.stdout.write(`    ${s.id.padEnd(22)} [${ratio}] ${s.label} — ${s.description}\n`);
    }
  }
  return 0;
}
