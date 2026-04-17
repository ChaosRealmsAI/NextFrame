// Integration test — exercise all three modes through the runtime entry.
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

test("integration: play → edit → record share same resolved and render consistently", async (t) => {
  t.after(resetAll);
  const dom = installDom();
  const raf = installRaf();
  const br = installBridge({ withReply: true });
  installEngineAndTracks(buildTracks());
  globalThis.__nfResolved = buildResolved();
  const { start, stop, currentMode } = await import("../src/runtime.js");

  // --- play ---
  const clock = makeClock(0);
  const player = start({
    mode: "play",
    mount: dom.body,
    resolved: globalThis.__nfResolved,
    now: clock.now,
  });
  assert.equal(currentMode(), "play");
  player.resume();
  clock.advance(1000);
  raf.flush();
  const tAfterPlay = player.getT();
  assert.ok(tAfterPlay > 0, "play should advance t");
  player.pause();
  stop();

  // --- edit ---
  const editor = start({
    mode: "edit",
    mount: dom.body,
    resolved: globalThis.__nfResolved,
  });
  assert.equal(currentMode(), "edit");
  editor.seek(2);
  assert.equal(editor.getT(), 2);
  editor.setProps("t1", "props.color", "green");
  const resolvedAfter = globalThis.__nfRuntime.diagnose();
  assert.equal(resolvedAfter.mode, "edit");
  const res = await editor.requestWriteBack();
  assert.equal(res.ok, true);
  const writebackSent = br.sent.find((m) => m.kind === "source_writeback");
  assert.ok(writebackSent);
  stop();

  // --- record ---
  const recorder = start({
    mode: "record",
    mount: dom.body,
    resolved: globalThis.__nfResolved,
  });
  assert.equal(currentMode(), "record");
  const tickP = recorder.tick(0.1);
  raf.flush();
  raf.flush();
  const frame = await tickP;
  assert.equal(frame.t, 0.1);
  const frameReady = br.sent.find((m) => m.kind === "frame_ready");
  assert.ok(frameReady, "frame_ready posted");
  stop();
});

test("integration: mode switch does not leak __nfTick across modes", async (t) => {
  t.after(resetAll);
  const dom = installDom();
  installRaf();
  installBridge();
  installEngineAndTracks(buildTracks());
  const { start, stop } = await import("../src/runtime.js");
  start({ mode: "play", mount: dom.body, resolved: buildResolved() });
  // play does not install __nfTick
  assert.equal(globalThis.__nfTick, undefined);
  stop();
  start({ mode: "record", mount: dom.body, resolved: buildResolved() });
  assert.equal(typeof globalThis.__nfTick, "function");
  stop();
  // After stop() in record mode, dispose restores prior tick (undefined).
  assert.equal(globalThis.__nfTick, undefined);
});
