// Hot-load loader for user-authored Tracks.
//
// Usage (node/CLI):
//   import { loadUserTracks } from "./loader.js";
//   const tracks = await loadUserTracks("src/nf-tracks/user");
//
// Usage (browser):
//   const tracks = await loadUserTracks(import.meta.url, ["mytrack.js"]);
//
// Behaviour:
//   - For every .js file (except loader.js itself), dynamic-import it
//   - Validate through validateTrackModule — skip invalid, emit warnings
//   - Return { name -> module } map

import { validateTrackModule } from "../abi/index.js";

const isNode = typeof process !== "undefined" && !!process.versions?.node;

/**
 * Load user tracks from a directory (node) or a list of URLs (browser).
 * @param {string} dirOrBase   Directory path (node) or base URL (browser).
 * @param {string[]=} fileList Optional list of filenames (browser only).
 * @returns {Promise<{tracks: Record<string, object>, warnings: string[]}>}
 */
export async function loadUserTracks(dirOrBase, fileList) {
  const warnings = [];
  const tracks = {};
  const entries = await resolveEntries(dirOrBase, fileList, warnings);

  for (const entry of entries) {
    try {
      const mod = await import(entry.url);
      const check = validateTrackModule(mod);
      if (!check.ok) {
        warnings.push(`skipped ${entry.name}: ${check.errors.join(", ")}`);
        continue;
      }
      tracks[entry.name] = mod;
    } catch (err) {
      warnings.push(`skipped ${entry.name}: ${err?.message ?? String(err)}`);
    }
  }

  return { tracks, warnings };
}

async function resolveEntries(dirOrBase, fileList, warnings) {
  if (isNode && !fileList) {
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const url = await import("node:url");
      const files = fs.readdirSync(dirOrBase).filter((f) => f.endsWith(".js") && f !== "loader.js");
      return files.map((f) => ({
        name: f.replace(/\.js$/, ""),
        url: url.pathToFileURL(path.resolve(dirOrBase, f)).href,
      }));
    } catch (err) {
      warnings.push(`readdir failed: ${err?.message ?? String(err)}`);
      return [];
    }
  }
  if (!fileList || fileList.length === 0) {
    warnings.push("browser mode requires an explicit fileList");
    return [];
  }
  return fileList.map((f) => ({
    name: f.replace(/\.js$/, ""),
    url: new URL(f, dirOrBase).href,
  }));
}
