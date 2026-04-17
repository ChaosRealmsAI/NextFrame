import { test } from "node:test";
import assert from "node:assert/strict";
import {
  installDom,
  installRaf,
  installBridge,
  buildResolved,
  buildTracks,
  installEngineAndTracks,
  makeClock,
  resetAll,
} from "./_helpers.mjs";

async function bootWith(mode, options = {}) {
  const dom = installDom();
  const raf = installRaf();
  installBridge({ withReply: true });
  installEngineAndTracks(buildTracks());
  globalThis.__nfResolved = buildResolved();
  const rt = await import("../src/runtime.js");
  const runtime = rt.start({ mode, mount: dom.body, resolved: globalThis.__nfResolved, ...options });
  return { dom, raf, rt, runtime };
}

test("runtime: start('play') returns play controller and advances t", async (t) => {
  t.after(resetAll);
  const clock = makeClock(0);
  const { raf, rt, runtime } = await bootWith("play", { now: clock.now, playbackRate: 1 });
  assert.equal(runtime.mode, "play");
  assert.equal(rt.currentMode(), "play");
  runtime.resume();
  clock.advance(500);
  raf.flush();
  assert.ok(runtime.getT() >= 0.4, `expected t≥0.4, got ${runtime.getT()}`);
  runtime.pause();
});

test("runtime: start('edit') keeps t=0 until seek", async (t) => {
  t.after(resetAll);
  const { rt, runtime } = await bootWith("edit");
  assert.equal(rt.currentMode(), "edit");
  assert.equal(runtime.getT(), 0);
  runtime.seek(4.2);
  assert.equal(runtime.getT(), 4.2);
});

test("runtime: start('record') installs __nfTick, doesn't RAF", async (t) => {
  t.after(resetAll);
  const { raf, rt } = await bootWith("record");
  assert.equal(rt.currentMode(), "record");
  assert.equal(typeof globalThis.__nfTick, "function");
  assert.equal(raf.queue.length, 0);
});

test("runtime: currentMode() matches last start()", async (t) => {
  t.after(resetAll);
  await bootWith("play");
  const { currentMode } = await import("../src/runtime.js");
  assert.equal(currentMode(), "play");
});

test("runtime: window.__nfRuntime exposes seek/getT/pause/resume/diagnose", async (t) => {
  t.after(resetAll);
  await bootWith("play", { now: () => 0 });
  const api = globalThis.__nfRuntime;
  assert.ok(api, "__nfRuntime should be set");
  assert.equal(typeof api.seek, "function");
  assert.equal(typeof api.getT, "function");
  assert.equal(typeof api.pause, "function");
  assert.equal(typeof api.resume, "function");
  assert.equal(typeof api.diagnose, "function");
  assert.equal(api.mode(), "play");
  const diag = api.diagnose();
  assert.equal(diag.mode, "play");
});

test("runtime: unknown mode throws", async (t) => {
  t.after(resetAll);
  const dom = installDom();
  installRaf();
  installEngineAndTracks(buildTracks());
  const { start } = await import("../src/runtime.js");
  assert.throws(
    () => start({ mode: "bogus", mount: dom.body, resolved: buildResolved() }),
    /unknown mode/
  );
});

test("runtime: fallback engine works when __nfEngine missing", async (t) => {
  t.after(resetAll);
  const dom = installDom();
  installRaf();
  // Do NOT install engine — test built-in shim.
  globalThis.__nfTracks = buildTracks();
  const { start } = await import("../src/runtime.js");
  const runtime = start({ mode: "edit", mount: dom.body, resolved: buildResolved() });
  assert.equal(runtime.mode, "edit");
  assert.equal(runtime.getT(), 0);
});

test("runtime: string arg legacy path returns stub controllers", async (t) => {
  t.after(resetAll);
  const { start } = await import("../src/runtime.js");
  const play = start("play");
  assert.equal(play.mode, "play");
  const edit = start("edit");
  assert.equal(edit.mode, "edit");
  const rec = start("record");
  assert.equal(rec.mode, "record");
});
