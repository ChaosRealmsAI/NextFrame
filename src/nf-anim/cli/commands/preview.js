import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
const meta = { name: "preview", kind: "cli", description: "Preview launcher stub" };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".svg": "image/svg+xml", ".css": "text/css; charset=utf-8" };
export default async function previewCmd() {
  // TODO: add hot-reload if the browser preview becomes the main authoring loop.
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../.."), file = "/src/nf-anim/examples/gallery.html";
  const server = http.createServer((req, res) => { const raw = decodeURIComponent((req.url || "/").split("?")[0]), rel = raw === "/" ? file : raw, full = path.resolve(root, `.${rel}`); if (!full.startsWith(root)) return void res.writeHead(403).end("Fix: path escapes repo root"); try { res.writeHead(200, { "content-type": MIME[path.extname(full)] || "text/plain; charset=utf-8" }); res.end(fs.readFileSync(full)); } catch { res.writeHead(404).end(`Fix: missing ${rel}`); } });
  const payload = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ ok: true, url: `http://127.0.0.1:${server.address().port}${file}` })));
  spawn("open", [payload.url], { stdio: "ignore", detached: true }).unref();
  server.on("close", () => process.exit(0));
  console.log(JSON.stringify(payload, null, 2));
  return payload;
}
export { meta };
