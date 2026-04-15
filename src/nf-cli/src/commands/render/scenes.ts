// nextframe scenes — list available scenes from nf-core/scenes/ auto-discovery.
// nextframe scenes <id> — show single scene details.
import { parseFlags } from "../_helpers/_io.js";
import { listScenes, getScene } from "../_helpers/_scene-registry.js";

export async function run(argv: string[]) {
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
    const meta = (scene.META || scene) as Record<string, unknown>;
    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: true, value: meta }, null, 2) + "\n");
    } else {
      process.stdout.write(`${meta["id"]} [${meta["tech"]}] — ${meta["label"]}\n`);
      process.stdout.write(`  ratio: ${meta["ratio"]}\n`);
      process.stdout.write(`  category: ${meta["category"]}\n`);
      process.stdout.write(`  description: ${meta["description"]}\n`);
      process.stdout.write(`  duration_hint: ${meta["duration_hint"]}s\n`);
      if (meta["loopable"]) process.stdout.write(`  loopable: true\n`);
      const tags = meta["tags"];
      if (tags) process.stdout.write(`  tags: ${(tags as string[]).join(", ")}\n`);
      const themes = meta["themes"];
      if (themes) process.stdout.write(`  themes: ${Object.keys(themes as Record<string, unknown>).join(", ")}\n`);
      const params = meta["params"];
      if (params) {
        process.stdout.write(`  params:\n`);
        for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
          const sv = v as { default?: unknown; range?: [number, number]; type?: string; label?: string };
          const def = sv.default !== undefined ? ` = ${JSON.stringify(sv.default)}` : " (required)";
          const range = sv.range ? ` [${sv.range[0]}..${sv.range[1]}]` : "";
          process.stdout.write(`    ${k}: ${sv.type}${def}${range} — ${sv.label}\n`);
        }
      }
      const ai = meta["ai"] as { when?: string; avoid?: string } | undefined;
      if (ai) {
        process.stdout.write(`  ai.when: ${ai.when}\n`);
        if (ai.avoid) process.stdout.write(`  ai.avoid: ${ai.avoid}\n`);
      }
    }
    return 0;
  }

  // List all scenes
  let scenes = await listScenes();

  // Filter by --ratio
  if (flags.ratio) {
    scenes = scenes.filter((s) => (s as unknown as Record<string, unknown>).ratio === flags.ratio);
  }

  // Filter by --search (case-insensitive partial match across id/label/description/tags/mood/theme)
  if (flags.search) {
    const q = String(flags.search).toLowerCase();
    scenes = scenes.filter((s) => {
      const sr = s as unknown as Record<string, unknown>;
      const fields = [
        sr.id,
        sr.label,
        sr.description,
        ...(Array.isArray(sr.tags) ? sr.tags as string[] : []),
        ...(Array.isArray(sr.mood) ? sr.mood as string[] : []),
        ...(sr.themes ? Object.keys(sr.themes as Record<string, unknown>) : []),
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

  const byCategory: Record<string, unknown[]> = {};
  for (const s of scenes) {
    const sr = s as unknown as Record<string, unknown>;
    const cat = (sr.category || sr.role || "other") as string;
    (byCategory[cat] || (byCategory[cat] = [])).push(s);
  }
  for (const [cat, items] of Object.entries(byCategory).sort()) {
    process.stdout.write(`  ${cat}:\n`);
    for (const s of items as Array<Record<string, unknown>>) {
      const ratio = s["ratio"] || "?";
      const label = s["label"] || s["name"] || "";
      const theme = s["theme"] ? ` ${s["theme"]}` : "";
      process.stdout.write(`    ${String(s["id"]).padEnd(22)} [${ratio}${theme}] ${label} — ${s["description"]}\n`);
    }
  }
  return 0;
}
