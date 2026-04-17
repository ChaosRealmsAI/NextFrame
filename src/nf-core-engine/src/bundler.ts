// Bundler: inlines Resolved JSON + referenced Track `.js` modules into a
// single HTML file. No external imports at runtime — tracks are IIFE-wrapped
// and registered on `window.__nfTracks` keyed by Track name.

import { readFileSync, existsSync } from "node:fs";
import { join, resolve, isAbsolute } from "node:path";
import type { ResolvedBundle } from "./anchor.js";

export interface BundleOptions {
  tracksDir?: string;
  assetBase?: string;
}

interface Keyframe {
  [k: string]: unknown;
}

interface TrackSpec {
  kind: string;
  id?: string;
  keyframes?: Keyframe[];
}

function extractTrackKinds(resolved: ResolvedBundle): string[] {
  const seen = new Set<string>();
  for (const t of resolved.tracks as TrackSpec[]) {
    if (t && typeof t.kind === "string") seen.add(t.kind);
  }
  return [...seen];
}

function readTrackModule(tracksDir: string, kind: string): string | null {
  const p = join(tracksDir, `${kind}.js`);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

function escapeScript(s: string): string {
  return s.replace(/<\/script/gi, "<\\/script").replace(/<!--/g, "<\\!--");
}

function escapeJsonForHtml(s: string): string {
  return s.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

// Wrap an ESM-style track module as an IIFE and capture its named exports
// into window.__nfTracks[kind]. Strips `export ` prefixes.
function wrapTrackIIFE(kind: string, src: string): string {
  const names: string[] = [];
  const stripped = src.replace(
    /\bexport\s+function\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    (_m, name: string) => {
      names.push(name);
      return `function ${name}`;
    },
  );
  const assigns = names.map((n) => `    ${n},`).join("\n");
  return [
    `(function(){`,
    stripped,
    `  (window.__nfTracks = window.__nfTracks || {})[${JSON.stringify(kind)}] = {`,
    assigns,
    `  };`,
    `})();`,
  ].join("\n");
}

export function bundle(resolved: ResolvedBundle, options: BundleOptions = {}): string {
  const tracksDir = options.tracksDir
    ? (isAbsolute(options.tracksDir) ? options.tracksDir : resolve(options.tracksDir))
    : defaultTracksDir();

  const kinds = extractTrackKinds(resolved);
  const trackBlocks: string[] = [];
  const warnings: string[] = [];
  for (const kind of kinds) {
    const src = readTrackModule(tracksDir, kind);
    if (src === null) {
      warnings.push(`track "${kind}" not found in ${tracksDir}`);
      continue;
    }
    trackBlocks.push(`<script>${escapeScript(wrapTrackIIFE(kind, src))}</script>`);
  }

  const payload = JSON.stringify(resolved);
  const parts = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>NextFrame bundle</title>`,
    "</head>",
    "<body>",
    '<div id="nf-root"></div>',
    `<script type="application/json" id="nf-resolved">${escapeJsonForHtml(payload)}</script>`,
    "<script>window.__nfResolved = JSON.parse(document.getElementById('nf-resolved').textContent);</script>",
    ...trackBlocks,
  ];
  if (warnings.length > 0) {
    parts.push(`<!-- bundler-warnings: ${warnings.join("; ")} -->`);
  }
  parts.push("</body>", "</html>", "");
  // TODO(implement): cache inlined assets (base64 images/videos) once
  // streaming asset pipeline lands. For now keyframes carry literal values.
  return parts.join("\n");
}

function defaultTracksDir(): string {
  // Resolve relative to this module's location so build-from-dist works.
  // The built CLI sits at src/nf-core-engine/dist/cli.js, tracks live at
  // src/nf-tracks/official. Fall back to cwd-relative.
  const envDir = process.env.NF_TRACKS_DIR;
  if (envDir && envDir.length > 0) return envDir;
  const cwdGuess = resolve(process.cwd(), "src/nf-tracks/official");
  if (existsSync(cwdGuess)) return cwdGuess;
  const upGuess = resolve(process.cwd(), "../nf-tracks/official");
  return upGuess;
}
