import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { chromium } from "playwright";

const root = resolve(".");
const refHtml = "/Users/Zhuanz/bigbang/NextFrame/spec/design/prototypes/editor-v0.1.html";
const outDir = resolve(root, "tmp-w4");

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function serve() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    try {
      const file = await readFile(join(root, pathname));
      res.writeHead(200, { "content-type": types[extname(pathname)] ?? "application/octet-stream" });
      res.end(file);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((resolveServer) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "object" && address) resolveServer({ server, port: address.port });
    });
  });
}

async function assertDom(page) {
  const result = await page.evaluate(() => {
    const tags = ["nf-topbar", "nf-clips", "nf-log", "nf-timeline", "nf-track", "nf-clip", "nf-anchor", "nf-inspector"];
    const hosts = [];
    const visit = (root) => {
      root.querySelectorAll("*").forEach((node) => {
        if (tags.includes(node.localName)) hosts.push(node);
        if (node.shadowRoot) visit(node.shadowRoot);
      });
    };
    visit(document);
    return tags.map((tag) => {
      const match = hosts.find((node) => node.localName === tag);
      return {
        tag,
        defined: customElements.get(tag) != null,
        shadow: match?.shadowRoot?.mode ?? null,
      };
    });
  });
  const bad = result.filter((item) => !item.defined || item.shadow !== "open");
  if (bad.length) throw new Error(`DOM check failed: ${JSON.stringify(bad)}`);
}

async function assertTrackColors(page) {
  const colors = await page.evaluate(() => {
    const sample = (kind) => {
      const el = document.createElement("nf-track");
      el.setAttribute("kind", kind);
      document.body.appendChild(el);
      const stripe = el.shadowRoot?.querySelector(".stripe");
      const color = stripe ? getComputedStyle(stripe).backgroundColor : "";
      el.remove();
      return color;
    };
    return {
      scene: sample("scene"),
      text: sample("text"),
      audio: sample("audio"),
    };
  });
  const expected = {
    scene: "rgb(167, 139, 250)",
    text: "rgb(224, 183, 108)",
    audio: "rgb(123, 201, 181)",
  };
  for (const [kind, color] of Object.entries(expected)) {
    if (colors[kind] !== color) throw new Error(`track ${kind}: expected ${color}, got ${colors[kind]}`);
  }
}

async function assertPixelDiff(page, browser, baseUrl) {
  await import("node:fs/promises").then((fs) => fs.mkdir(outDir, { recursive: true }));
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(outDir, "app.png") });
  const ref = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ref.goto(`file://${refHtml}`, { waitUntil: "networkidle" });
  await ref.screenshot({ path: join(outDir, "ref.png") });
  await ref.close();
  const appPng = PNG.sync.read(await readFile(join(outDir, "app.png")));
  const refPng = PNG.sync.read(await readFile(join(outDir, "ref.png")));
  if (appPng.width !== refPng.width || appPng.height !== refPng.height) {
    throw new Error(`screenshot size mismatch app=${appPng.width}x${appPng.height} ref=${refPng.width}x${refPng.height}`);
  }
  const diff = new PNG({ width: appPng.width, height: appPng.height });
  const pixels = pixelmatch(refPng.data, appPng.data, diff.data, appPng.width, appPng.height, { threshold: 0.1 });
  const ratio = pixels / (appPng.width * appPng.height);
  if (ratio >= 0.01) throw new Error(`pixel diff ${(ratio * 100).toFixed(3)}% >= 1%`);
  return ratio;
}

const { server, port } = await serve();
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const baseUrl = `http://127.0.0.1:${port}/index.html`;
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await assertDom(page);
  await assertTrackColors(page);
  const ratio = await assertPixelDiff(page, browser, baseUrl);
  console.log(`W4 playwright checks passed; pixel diff ${(ratio * 100).toFixed(3)}%`);
  await page.close();
} finally {
  await browser?.close();
  server.close();
}
