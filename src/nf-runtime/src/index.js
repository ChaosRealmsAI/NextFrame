// nf-runtime entry — exports API for Node tests AND emits an inlinable IIFE
// string that bundlers (nf-engine) paste into bundle.html.

import { boot, getStateAt, loadTrack } from "./runtime.js";
import { attachSelfVerify } from "./self-verify.js";

export { boot, getStateAt, loadTrack, attachSelfVerify };

// Public API namespace for bundle.html: `NFRuntime.boot({...})` then `window.__nf`.
export const NFRuntime = {
  boot(options) {
    const handle = boot(options);
    attachSelfVerify(handle);
    return handle;
  },
  getStateAt,
};

// -----------------------------------------------------------------------------
// getRuntimeSource() — returns an IIFE string the bundler inlines into bundle.html.
// The IIFE exposes `window.NFRuntime = { boot, getStateAt }`. Zero external refs.
// -----------------------------------------------------------------------------
export function getRuntimeSource() {
  // Inline sources at call time via fs.readFileSync so bundler gets the exact
  // current file content (dev workflow: edit .js, re-bundle, no build step).
  //
  // This function runs at bundle time (Node side). In browser it's dead code.
  // Bundler invokes it from Node, takes the returned string, and inlines it
  // into bundle.html inside <script>...</script>.

  // We read the sibling files relative to this file.
  // ESM __dirname shim:
  const url = import.meta.url;
  const path = _nodePath();
  const fs = _nodeFs();
  if (!path || !fs) {
    throw new Error("getRuntimeSource(): must be called from Node (bundler)");
  }
  const here = path.dirname(url.startsWith("file://") ? url.slice(7) : url);
  const runtimeSrc = fs.readFileSync(path.join(here, "runtime.js"), "utf8");
  const selfVerifySrc = fs.readFileSync(path.join(here, "self-verify.js"), "utf8");

  // Strip ESM syntax — we're emitting a plain IIFE that assigns to window.NFRuntime.
  const stripped = (src) =>
    src
      .replace(/^\s*export\s+function\s+/gm, "function ")
      .replace(/^\s*export\s+const\s+/gm, "const ")
      .replace(/^\s*export\s+\{[^}]*\};?\s*$/gm, "")
      .replace(/^\s*import\s+[^;]+;\s*$/gm, "");

  const runtimeBody = stripped(runtimeSrc);
  const selfVerifyBody = stripped(selfVerifySrc);

  return [
    "(function(){",
    "\"use strict\";",
    runtimeBody,
    selfVerifyBody,
    "var __nf_boot = boot;",
    "window.NFRuntime = {",
    "  boot: function(options){ var h = __nf_boot(options); attachSelfVerify(h); return h; },",
    "  getStateAt: getStateAt",
    "};",
    "})();",
  ].join("\n");
}

function _nodePath() {
  try {
    // eslint-disable-next-line no-undef
    return require("path");
  } catch (_e) { /* fall through */ }
  try {
    return globalThis.process && globalThis.process.getBuiltinModule
      ? globalThis.process.getBuiltinModule("path")
      : null;
  } catch (_e) { return null; }
}

function _nodeFs() {
  try {
    // eslint-disable-next-line no-undef
    return require("fs");
  } catch (_e) { /* fall through */ }
  try {
    return globalThis.process && globalThis.process.getBuiltinModule
      ? globalThis.process.getBuiltinModule("fs")
      : null;
  } catch (_e) { return null; }
}
