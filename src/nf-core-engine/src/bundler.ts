// Bundler: inlines Resolved JSON + referenced Track `.js` modules into a
// single HTML file. No external imports at runtime — tracks are IIFE-wrapped
// and registered on `window.__nfTracks` keyed by Track name. Assets referenced
// by track keyframes (src / audioSrc / mp3 / image) are base64-inlined as
// data: URLs whenever the path resolves to a file on disk.

import { readFileSync, existsSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import type { ResolvedBundle } from "./anchor.js";

export interface BundleOptions {
  tracksDir?: string;
  assetBase?: string;
  sourcePath?: string;
}

interface Keyframe {
  [k: string]: unknown;
}

interface TrackSpec {
  kind: string;
  id?: string;
  keyframes?: Keyframe[];
}

const ASSET_KEYS = new Set([
  "src",
  "image",
  "imageSrc",
  "audio",
  "audioSrc",
  "mp3",
  "video",
  "videoSrc",
  "poster",
]);

const ASSET_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

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

function resolveAssetPath(ref: string, options: BundleOptions): string | null {
  if (!ref || typeof ref !== "string") return null;
  if (/^(https?:|data:|file:)/i.test(ref)) return null;
  const base = options.assetBase ?? (options.sourcePath ? dirnameOf(options.sourcePath) : process.cwd());
  const abs = isAbsolute(ref) ? ref : resolve(base, ref);
  return existsSync(abs) ? abs : null;
}

function dirnameOf(p: string): string {
  const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return idx < 0 ? process.cwd() : p.slice(0, idx);
}

function encodeAsDataUrl(absPath: string): string | null {
  const ext = extname(absPath).toLowerCase();
  const mime = ASSET_MIME[ext];
  if (!mime) return null;
  const buf = readFileSync(absPath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

// Walk the resolved tracks and replace file-path asset refs with data URLs.
// Returns a cloned resolved bundle so we don't mutate caller state.
function inlineAssets(resolved: ResolvedBundle, options: BundleOptions): {
  bundle: ResolvedBundle;
  warnings: string[];
  inlined: number;
} {
  const warnings: string[] = [];
  let inlined = 0;
  const clone = JSON.parse(JSON.stringify(resolved)) as ResolvedBundle;
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const entry of node) visit(entry);
      return;
    }
    if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string" && ASSET_KEYS.has(k)) {
          const absPath = resolveAssetPath(v, options);
          if (absPath) {
            const dataUrl = encodeAsDataUrl(absPath);
            if (dataUrl) {
              obj[k] = dataUrl;
              inlined += 1;
            } else {
              warnings.push(`asset "${v}" has unknown extension; kept as path`);
            }
          }
        } else {
          visit(v);
        }
      }
    }
  };
  visit(clone.tracks);
  return { bundle: clone, warnings, inlined };
}

export interface BundleResult {
  html: string;
  warnings: string[];
  tracks_included: string[];
  assets_inlined: number;
}

export function bundle(resolved: ResolvedBundle, options: BundleOptions = {}): string {
  return bundleDetailed(resolved, options).html;
}

export function bundleDetailed(
  resolved: ResolvedBundle,
  options: BundleOptions = {},
): BundleResult {
  const tracksDir = options.tracksDir
    ? (isAbsolute(options.tracksDir) ? options.tracksDir : resolve(options.tracksDir))
    : defaultTracksDir();

  const kinds = extractTrackKinds(resolved);
  const trackBlocks: string[] = [];
  const tracks_included: string[] = [];
  const warnings: string[] = [];
  for (const kind of kinds) {
    const src = readTrackModule(tracksDir, kind);
    if (src === null) {
      warnings.push(`track "${kind}" not found in ${tracksDir}`);
      continue;
    }
    tracks_included.push(kind);
    trackBlocks.push(`<script>${escapeScript(wrapTrackIIFE(kind, src))}</script>`);
  }

  const inlinePass = inlineAssets(resolved, options);
  warnings.push(...inlinePass.warnings);
  const payload = JSON.stringify(inlinePass.bundle);
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
  return {
    html: parts.join("\n"),
    warnings,
    tracks_included,
    assets_inlined: inlinePass.inlined,
  };
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
