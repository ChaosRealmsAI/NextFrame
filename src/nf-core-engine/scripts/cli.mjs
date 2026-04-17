import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const result = { cmd: cmd ?? "", source: undefined, output: undefined };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "-o" || arg === "--output") {
      result.output = rest[i + 1];
      i += 1;
    } else if (!arg.startsWith("-") && !result.source) {
      result.source = arg;
    }
  }
  return result;
}

function parseSource(text) {
  const raw = JSON.parse(text);
  return {
    raw,
    viewport: raw.viewport ?? { ratio: "16:9", w: 1920, h: 1080 },
    tracks: raw.tracks ?? [],
  };
}

function resolveAnchors(ast) {
  const anchors = {};
  const rawAnchors = ast.raw?.anchors;
  if (rawAnchors && typeof rawAnchors === "object") {
    for (const [key, value] of Object.entries(rawAnchors)) {
      anchors[key] = typeof value === "number" ? value : 0;
    }
  }
  return { viewport: ast.viewport, tracks: ast.tracks, anchors };
}

function escapeJsonForHtml(text) {
  return text.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
}

function bundle(resolved) {
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

function compile(sourceText) {
  const ast = parseSource(sourceText);
  const resolved = resolveAnchors(ast);
  const html = bundle(resolved);
  return { html, bytes: html.length, warnings: [] };
}

function main() {
  const { cmd, source, output } = parseArgs(process.argv.slice(2));
  if (cmd !== "build") {
    process.stderr.write(JSON.stringify({ ok: false, error: `unknown command: ${cmd}` }) + "\n");
    return 2;
  }
  if (!source || !output) {
    process.stderr.write(JSON.stringify({ ok: false, error: "usage: build <source> -o <output>" }) + "\n");
    return 2;
  }

  const result = compile(readFileSync(source, "utf8"));
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, result.html, "utf8");
  process.stdout.write(
    JSON.stringify({ ok: true, source, output, bytes: result.bytes, warnings: result.warnings }) + "\n",
  );
  return 0;
}

process.exit(main());
