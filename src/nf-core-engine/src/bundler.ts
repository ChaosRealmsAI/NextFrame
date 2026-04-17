// Bundler: inlines Resolved JSON + referenced Track `.js` modules into a
// single HTML file. No external imports at runtime — tracks are IIFE-wrapped
// and registered on `window.__nfTracks` keyed by Track name. Assets referenced
// by track keyframes (src / audioSrc / mp3 / image) are base64-inlined as
// data: URLs whenever the path resolves to a file on disk.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
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

interface InlineBinding {
  imported: string;
  local: string;
}

interface InlineImport {
  specifier: string;
  bindings: InlineBinding[];
}

interface InlineReexport {
  specifier: string;
  bindings: InlineBinding[];
}

interface InlineModule {
  key: string;
  path: string;
  imports: InlineImport[];
  localExports: InlineBinding[];
  reexports: InlineReexport[];
  body: string;
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

function readInlineModuleTree(rootDir: string, namespace: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    const entries = readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".js")) {
        out.push(inlineModuleKey(namespace, rootDir, absPath));
      }
    }
  };
  walk(rootDir);
  return out;
}

function inlineModuleKey(namespace: string, rootDir: string, absPath: string): string {
  return `${namespace}/${relative(rootDir, absPath).replace(/\\/g, "/")}`;
}

function resolveInlineModulePath(key: string, roots: Record<string, string>): string {
  const slash = key.indexOf("/");
  const namespace = slash < 0 ? key : key.slice(0, slash);
  const relPath = slash < 0 ? "" : key.slice(slash + 1);
  const root = roots[namespace];
  if (!root) throw new Error(`unknown inline module namespace: ${namespace}`);
  return resolve(root, relPath);
}

function parseBindings(src: string): InlineBinding[] {
  return src
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => {
      const match = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(part);
      if (!match) throw new Error(`unsupported inline import/export binding: ${part}`);
      return {
        imported: match[1],
        local: match[2] ?? match[1],
      };
    });
}

function parseInlineModule(namespace: string, rootDir: string, absPath: string): InlineModule {
  const key = inlineModuleKey(namespace, rootDir, absPath);
  const src = readFileSync(absPath, "utf8");
  const imports: InlineImport[] = [];
  const localExports: InlineBinding[] = [];
  const reexports: InlineReexport[] = [];

  let body = src.replace(
    /^\s*import\s*\{([^}]+)\}\s*from\s*["'](.+?)["'];?\s*$/gm,
    (_match, names: string, specifier: string) => {
      imports.push({ specifier, bindings: parseBindings(names) });
      return "";
    },
  );

  body = body.replace(
    /\bexport\s+function\s+([A-Za-z_$][\w$]*)/g,
    (_match, name: string) => {
      localExports.push({ imported: name, local: name });
      return `function ${name}`;
    },
  );

  body = body.replace(
    /^\s*export\s*\{([^}]+)\}\s*from\s*["'](.+?)["'];?\s*$/gm,
    (_match, names: string, specifier: string) => {
      reexports.push({ specifier, bindings: parseBindings(names) });
      return "";
    },
  );

  body = body.replace(
    /^\s*export\s*\{([^}]+)\};?\s*$/gm,
    (_match, names: string) => {
      localExports.push(...parseBindings(names));
      return "";
    },
  );

  return {
    key,
    path: absPath,
    imports,
    localExports,
    reexports,
    body: body.trim(),
  };
}

function topologicallyOrderInlineModules(
  roots: Record<string, string>,
  allModuleKeys: string[],
): InlineModule[] {
  const known = new Set(allModuleKeys);
  const cache = new Map<string, InlineModule>();
  const ordered: InlineModule[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (key: string): void => {
    if (visited.has(key)) return;
    if (visiting.has(key)) {
      throw new Error(`cyclic inline module dependency: ${key}`);
    }
    visiting.add(key);
    const absPath = resolveInlineModulePath(key, roots);
    const slash = key.indexOf("/");
    const namespace = slash < 0 ? key : key.slice(0, slash);
    const rootDir = roots[namespace];
    const mod = cache.get(key) ?? parseInlineModule(namespace, rootDir, absPath);
    cache.set(key, mod);
    for (const dep of [...mod.imports, ...mod.reexports]) {
      if (!dep.specifier.startsWith(".")) continue;
      const depAbs = resolve(dirname(absPath), dep.specifier);
      const depKey = inlineModuleKey(namespace, rootDir, depAbs);
      if (known.has(depKey)) visit(depKey);
    }
    visiting.delete(key);
    visited.add(key);
    ordered.push(mod);
  };

  for (const key of allModuleKeys.sort()) visit(key);
  return ordered;
}

function renderInlineModuleScript(
  mod: InlineModule,
  namespaceRoots: Record<string, string>,
): string {
  const absPath = mod.path;
  const namespace = mod.key.slice(0, mod.key.indexOf("/"));
  const rootDir = namespaceRoots[namespace];
  const lines = [
    "(function(){",
    "  const __nfModules = (window.__nfInlineModules = window.__nfInlineModules || Object.create(null));",
  ];

  for (const imp of mod.imports) {
    if (!imp.specifier.startsWith(".")) continue;
    const depKey = inlineModuleKey(namespace, rootDir, resolve(dirname(absPath), imp.specifier));
    const mapping = imp.bindings
      .map((binding) => binding.imported === binding.local
        ? binding.imported
        : `${binding.imported}: ${binding.local}`)
      .join(", ");
    lines.push(`  const { ${mapping} } = __nfModules[${JSON.stringify(depKey)}] || {};`);
  }

  if (mod.body.length > 0) {
    lines.push(
      ...mod.body
        .split("\n")
        .map((line) => (line.length > 0 ? `  ${line}` : "")),
    );
  }

  lines.push(`  const __nfExports = (__nfModules[${JSON.stringify(mod.key)}] = __nfModules[${JSON.stringify(mod.key)}] || {});`);
  for (const binding of mod.localExports) {
    lines.push(`  __nfExports.${binding.local} = ${binding.local};`);
  }
  for (const reexport of mod.reexports) {
    if (!reexport.specifier.startsWith(".")) continue;
    const depKey = inlineModuleKey(namespace, rootDir, resolve(dirname(absPath), reexport.specifier));
    const refName = `__nfReexport_${Math.abs(hashText(`${mod.key}:${depKey}`))}`;
    lines.push(`  const ${refName} = __nfModules[${JSON.stringify(depKey)}] || {};`);
    for (const binding of reexport.bindings) {
      lines.push(`  __nfExports.${binding.local} = ${refName}.${binding.imported};`);
    }
  }
  if (mod.key === "nf-core-app/app.js") {
    lines.push("  window.__nfCoreApp = Object.assign(window.__nfCoreApp || {}, __nfExports);");
    lines.push("  window.__nfStart = __nfExports.start;");
  }
  if (mod.key === "nf-runtime/runtime.js") {
    lines.push("  window.__nfRuntime = Object.assign(window.__nfRuntime || {}, __nfExports);");
  }
  lines.push("})();");
  return `<script>${escapeScript(lines.join("\n"))}</script>`;
}

function hashText(src: string): number {
  let hash = 0;
  for (let i = 0; i < src.length; i++) {
    hash = ((hash << 5) - hash) + src.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

function defaultInlineDir(pkg: string): string {
  const envName = `NF_${pkg.replace(/-/g, "_").toUpperCase()}_SRC_DIR`;
  const envDir = process.env[envName];
  if (envDir && envDir.length > 0) return envDir;
  const cwdGuess = resolve(process.cwd(), `src/${pkg}/src`);
  if (existsSync(cwdGuess)) return cwdGuess;
  return resolve(process.cwd(), `../${pkg}/src`);
}

function renderRuntimeBundleScripts(): string[] {
  const namespaceRoots = {
    "nf-core-app": defaultInlineDir("nf-core-app"),
    "nf-runtime": defaultInlineDir("nf-runtime"),
  };
  const moduleKeys = [
    ...readInlineModuleTree(namespaceRoots["nf-core-app"], "nf-core-app"),
    ...readInlineModuleTree(namespaceRoots["nf-runtime"], "nf-runtime"),
  ];
  const ordered = topologicallyOrderInlineModules(namespaceRoots, moduleKeys);
  return ordered.map((mod) => renderInlineModuleScript(mod, namespaceRoots));
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
  const runtimeBlocks = renderRuntimeBundleScripts();
  const parts = [
    "<!doctype html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8">',
    `<title>NextFrame bundle</title>`,
    "<style>",
    "html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #090b0e; }",
    "body { position: relative; color: #ffffff; font-family: system-ui, sans-serif; }",
    "#nf-root { position: relative; width: 100%; height: 100%; overflow: hidden; }",
    "</style>",
    "</head>",
    "<body>",
    '<div id="nf-root"></div>',
    `<script type="application/json" id="nf-resolved">${escapeJsonForHtml(payload)}</script>`,
    "<script>window.__nfResolved = JSON.parse(document.getElementById('nf-resolved').textContent);</script>",
    ...trackBlocks,
    ...runtimeBlocks,
    `<script>${escapeScript(`(function() {
  const mode = new URLSearchParams(location.search).get("mode") || window.__nfMode || "play";
  window.__nfMode = mode;
  const mount = document.getElementById("nf-root");
  if (window.__nfRuntime && typeof window.__nfRuntime.start === "function") {
    window.__nfRuntime.start({ mode, mount, resolved: window.__nfResolved });
    return;
  }
  if (typeof window.__nfStart === "function") {
    window.__nfStart({ mode, root: mount, resolved: window.__nfResolved, win: window });
  }
})();`)}</script>`,
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
