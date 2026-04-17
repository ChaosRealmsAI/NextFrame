import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateProps } from "../scripts/validate-props.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../fixtures");

const tracks = ["text", "shape", "image", "video"];

for (const name of tracks) {
  test(`${name}: valid fixture passes AJV`, async () => {
    const mod = await import(`../official/${name}.js`);
    const props = JSON.parse(readFileSync(resolve(fixturesDir, `${name}-valid.json`), "utf8"));
    const res = validateProps(mod, props);
    assert.equal(res.valid, true, JSON.stringify(res.errors));
  });

  test(`${name}: invalid fixture is rejected`, async () => {
    const mod = await import(`../official/${name}.js`);
    const props = JSON.parse(readFileSync(resolve(fixturesDir, `${name}-invalid.json`), "utf8"));
    const res = validateProps(mod, props);
    assert.equal(res.valid, false);
    assert.ok(Array.isArray(res.errors) && res.errors.length > 0);
  });
}

test("validator reports meaningful error for missing required field", async () => {
  const mod = await import("../official/text.js");
  const res = validateProps(mod, { x: 0.5, y: 0.5 });
  assert.equal(res.valid, false);
  const msg = JSON.stringify(res.errors);
  assert.match(msg, /text/);
});
