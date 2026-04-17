import { test } from "node:test";
import assert from "node:assert/strict";
import { scanTrack } from "../scripts/check-abi.mjs";

const STUB_EXPORTS = `
export function describe() { return {}; }
export function sample() { return {}; }
export function render() { return {}; }
`;

function firstRule(res) {
  return res.violations[0]?.rule;
}

test("accepts a compliant minimal track", () => {
  const res = scanTrack(STUB_EXPORTS);
  assert.equal(res.ok, true);
});

test("rejects top-level import", () => {
  const code = `import x from "y";\n${STUB_EXPORTS}`;
  const res = scanTrack(code);
  assert.equal(res.ok, false);
  assert.equal(firstRule(res), "no-import");
});

test("rejects require() call", () => {
  const code = `const fs = require("node:fs");\n${STUB_EXPORTS}`;
  const res = scanTrack(code);
  assert.equal(res.ok, false);
  assert.equal(firstRule(res), "no-import");
});

test("rejects setTimeout", () => {
  const code = `${STUB_EXPORTS}\nsetTimeout(() => {}, 10);`;
  const res = scanTrack(code);
  assert.equal(firstRule(res), "no-timers");
});

test("rejects requestAnimationFrame", () => {
  const code = `${STUB_EXPORTS}\nrequestAnimationFrame(() => {});`;
  const res = scanTrack(code);
  assert.equal(firstRule(res), "no-timers");
});

test("rejects Date.now()", () => {
  const code = `${STUB_EXPORTS}\nconst n = Date.now();`;
  const res = scanTrack(code);
  assert.equal(firstRule(res), "no-clock");
});

test("rejects performance.now()", () => {
  const code = `${STUB_EXPORTS}\nconst n = performance.now();`;
  const res = scanTrack(code);
  assert.equal(firstRule(res), "no-clock");
});

test("rejects new Date()", () => {
  const code = `${STUB_EXPORTS}\nconst d = new Date();`;
  const res = scanTrack(code);
  assert.equal(firstRule(res), "no-clock");
});

test("rejects bare Math.random()", () => {
  const code = `${STUB_EXPORTS}\nconst r = Math.random();`;
  const res = scanTrack(code);
  assert.equal(firstRule(res), "no-random-unseeded");
});

test("allows Math.random with // seeded marker", () => {
  const code = `${STUB_EXPORTS}\nconst r = Math.random(); // seeded: test`;
  const res = scanTrack(code);
  assert.equal(res.ok, true);
});

test("rejects localStorage / sessionStorage", () => {
  for (const ident of ["localStorage", "sessionStorage", "indexedDB"]) {
    const code = `${STUB_EXPORTS}\nconst v = ${ident}.getItem("k");`;
    const res = scanTrack(code);
    assert.equal(firstRule(res), "no-storage", `expected no-storage for ${ident}`);
  }
});

test("rejects console.log", () => {
  const code = `${STUB_EXPORTS}\nconsole.log("hi");`;
  const res = scanTrack(code);
  assert.equal(firstRule(res), "no-console-prod");
});

test("reports missing required exports", () => {
  const res = scanTrack(`export function describe() { return {}; }`);
  assert.equal(res.ok, false);
  assert.ok(res.violations.some((v) => v.rule === "export-shape"));
});

test("reports parse errors gracefully", () => {
  const res = scanTrack(`this is not javascript !!!`);
  assert.equal(res.ok, false);
  assert.equal(firstRule(res), "parse-error");
});
