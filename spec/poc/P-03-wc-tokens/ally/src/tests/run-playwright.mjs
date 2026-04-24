import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const screenshots = path.join(root, "screenshots");
const pageUrl = pathToFileURL(path.join(root, "src/index.html")).href;

await mkdir(screenshots, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 1,
});

await page.goto(pageUrl);
await page.waitForFunction(() => typeof window.runPocTest === "function");

const order = [
  ["A", "test-a-shadow-var-live-update.png"],
  ["B", "test-b-global-style-isolation.png"],
  ["C", "test-c-host-kind-colors.png"],
  ["D", "test-d-perf-adopted-vs-root.png"],
];

const results = {};

for (const [key, filename] of order) {
  results[key] = await page.evaluate((testKey) => window.runPocTest(testKey), key);
  const panel = page.locator(`[data-test="${key}"]`);
  await panel.screenshot({ path: path.join(screenshots, filename) });
  if (key === "B") {
    await page.evaluate(() => window.cleanupGlobalPollution());
  }
}

await writeFile(path.join(root, "dist/test-results.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
await browser.close();

const failures = Object.values(results).filter((result) => result.status !== "pass");
console.log(JSON.stringify(results, null, 2));

if (failures.length > 0) {
  process.exitCode = 1;
}
