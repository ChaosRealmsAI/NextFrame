import { existsSync } from "node:fs";
import { parse as parsePath, isAbsolute, resolve as resolvePath } from "node:path";

import { parseFlags, loadTimeline, saveTimeline, emit } from "./_io.js";
import { resolveTimeline, timelineUsage } from "./_resolve.js";
import { ensureTimelineCollections } from "../timeline/ops.js";

const FLAG_USAGE = {
  "import-image": timelineUsage("import-image", " <image-path> [--id=ID]"),
  "import-audio": timelineUsage("import-audio", " <audio-path> [--id=ID]"),
  "list-assets": timelineUsage("list-assets", " [--json]"),
  "remove-asset": timelineUsage("remove-asset", " <asset-id>"),
};

const KIND_ORDER = new Map([
  ["image", 0],
  ["audio", 1],
]);

export async function run(argv, ctx) {
  const { positional, flags } = parseFlags(argv);
  const sub = ctx.subcommand;
  const resolved = resolveTimeline(positional, { usage: FLAG_USAGE[sub] });
  if (!resolved.ok) {
    emit(resolved, flags);
    return resolved.error?.code === "USAGE" ? 3 : 2;
  }

  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) {
    emit(loaded, flags);
    return 2;
  }

  const timeline = ensureTimelineCollections(loaded.value);
  const outcome = execute(sub, timeline, resolved.rest, flags);
  if (!outcome.ok) {
    emit(outcome, flags);
    return 2;
  }

  if (sub === "list-assets") {
    writeListOutput(outcome.value, flags);
    return 0;
  }

  const saved = await saveTimeline(resolved.jsonPath, outcome.timeline);
  if (!saved.ok) {
    emit(saved, flags);
    return 2;
  }

  emit({ ok: true, value: outcome.value }, flags);
  return 0;
}

function execute(sub, timeline, positional, flags) {
  if (sub === "import-image") return execImport(timeline, positional[0], flags.id, "image");
  if (sub === "import-audio") return execImport(timeline, positional[0], flags.id, "audio");
  if (sub === "list-assets") return execList(timeline);
  if (sub === "remove-asset") return execRemove(timeline, positional[0]);
  return { ok: false, error: { code: "BAD_SUBCOMMAND", message: `unknown ${sub}` } };
}

function execImport(timeline, assetPath, requestedId, kind) {
  if (!assetPath) return usageError(kind === "image" ? "import-image" : "import-audio");
  const resolvedPath = resolveAssetPath(assetPath);
  if (!existsSync(resolvedPath)) {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: `asset path not found: ${resolvedPath}`,
        hint: "provide a file that exists on disk",
      },
    };
  }

  const next = ensureTimelineCollections(timeline);
  const id = requestedId || nextAssetId(next.assets, kind, resolvedPath);
  if (next.assets.some((asset) => asset.id === id)) {
    return {
      ok: false,
      error: { code: "DUP_ASSET_ID", message: `asset "${id}" already exists`, ref: id },
    };
  }

  const asset = { id, path: resolvedPath, kind };
  next.assets.push(asset);
  return { ok: true, timeline: next, value: asset };
}

function execList(timeline) {
  return { ok: true, value: { assets: decorateAssets(timeline.assets) } };
}

function execRemove(timeline, assetId) {
  if (!assetId) return usageError("remove-asset");
  const next = ensureTimelineCollections(timeline);
  const index = next.assets.findIndex((asset) => asset.id === assetId);
  if (index === -1) {
    return {
      ok: false,
      error: { code: "ASSET_NOT_FOUND", message: `no asset "${assetId}"`, ref: assetId },
    };
  }
  next.assets.splice(index, 1);
  return { ok: true, timeline: next, value: { removed: assetId } };
}

function writeListOutput(value, flags) {
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, value }, null, 2) + "\n");
    return;
  }

  const lines = value.assets.map((asset) => {
    const suffix = asset.missing ? "  ⚠ missing" : "";
    return `[${asset.kind || "unknown"}] ${asset.id}  ${asset.path || ""}${suffix}`;
  });
  process.stdout.write((lines.join("\n") || "(no assets)") + "\n");
}

function decorateAssets(assets) {
  return [...(Array.isArray(assets) ? assets : [])]
    .map((asset) => ({
      ...asset,
      missing: Boolean(asset.path && !existsSync(resolveAssetPath(asset.path))),
    }))
    .sort(compareAssets);
}

function compareAssets(a, b) {
  const kindOrder = (KIND_ORDER.get(a.kind) ?? 99) - (KIND_ORDER.get(b.kind) ?? 99);
  if (kindOrder !== 0) return kindOrder;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

function nextAssetId(assets, kind, assetPath) {
  const prefix = kind === "image" ? "img" : "aud";
  const base = slugify(parsePath(assetPath).name || kind);
  const pattern = new RegExp(`^${prefix}-${escapeRegExp(base)}-(\\d+)$`);
  let max = 0;
  for (const asset of assets || []) {
    const match = String(asset.id || "").match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isInteger(value) && value > max) max = value;
  }
  return `${prefix}-${base}-${max + 1}`;
}

function slugify(value) {
  const slug = String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "asset";
}

function resolveAssetPath(path) {
  return isAbsolute(path) ? path : resolvePath(process.cwd(), path);
}

function emitUsage(sub, flags) {
  emit({ ok: false, error: { code: "USAGE", message: FLAG_USAGE[sub] || timelineUsage(sub) } }, flags);
}

function usageError(sub) {
  return { ok: false, error: { code: "USAGE", message: FLAG_USAGE[sub] } };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
