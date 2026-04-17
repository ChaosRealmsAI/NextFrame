// Bundler — inline tracks + runtime into a single HTML. Walking stub: emits minimal doc.

import type { ResolvedBundle } from "./anchor.js";

export function bundle(resolved: ResolvedBundle): string {
  const payload = JSON.stringify(resolved);
  return [
    "<!doctype html>",
    "<html lang=\"en\">",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<title>NextFrame bundle (walking stub)</title>",
    "</head>",
    "<body>",
    "<div id=\"nf-root\"></div>",
    `<script type="application/json" id="nf-resolved">${escapeJsonForHtml(payload)}</script>`,
    "<script>window.__nfResolved = JSON.parse(document.getElementById('nf-resolved').textContent);</script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}

function escapeJsonForHtml(s: string): string {
  return s.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}
