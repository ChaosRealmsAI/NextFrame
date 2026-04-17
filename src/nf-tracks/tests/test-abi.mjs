import { test } from "node:test";
import assert from "node:assert/strict";
import { installDomMock } from "./_dom-mock.mjs";
import {
  validateTrackModule,
  validateDescribe,
  renderInto,
  validateTrack,
} from "../abi/index.js";

installDomMock();

test("validateTrackModule passes on well-formed module", () => {
  const mod = { describe: () => ({}), sample: () => ({}), render: () => ({}) };
  assert.deepEqual(validateTrackModule(mod), { ok: true, errors: [] });
});

test("validateTrackModule reports each missing export", () => {
  const res = validateTrackModule({ describe: () => ({}) });
  assert.equal(res.ok, false);
  assert.equal(res.errors.length, 2);
});

test("validateTrackModule rejects non-objects", () => {
  assert.equal(validateTrackModule(null).ok, false);
  assert.equal(validateTrackModule("string").ok, false);
});

test("validateDescribe accepts draft-07 object schema", () => {
  const res = validateDescribe({ type: "object", properties: { x: { type: "number" } } });
  assert.equal(res.ok, true);
});

test("validateDescribe rejects non-object return", () => {
  assert.equal(validateDescribe(null).ok, false);
  assert.equal(validateDescribe([]).ok, false);
  assert.equal(validateDescribe("string").ok, false);
});

test("validateDescribe rejects missing properties map", () => {
  const res = validateDescribe({ type: "object" });
  assert.equal(res.ok, false);
});

test("renderInto returns { ok, dom } on success", () => {
  const mod = {
    describe: () => ({}),
    sample: () => ({}),
    render: () => ({ dom: "fake-el" }),
  };
  const res = renderInto(mod, [], 0, { w: 1920, h: 1080 });
  assert.equal(res.ok, true);
  assert.equal(res.dom, "fake-el");
});

test("renderInto catches thrown errors", () => {
  const mod = {
    describe: () => ({}),
    sample: () => ({}),
    render: () => { throw new Error("boom"); },
  };
  const res = renderInto(mod, [], 0, { w: 10, h: 10 });
  assert.equal(res.ok, false);
  assert.match(res.error, /boom/);
});

test("validateTrack fails when describe() throws", () => {
  const mod = {
    describe: () => { throw new Error("no"); },
    sample: () => ({}),
    render: () => ({}),
  };
  assert.equal(validateTrack(mod).ok, false);
});
