import { test } from "node:test";
import assert from "node:assert/strict";
import {
  installDom,
  installRaf,
  installBridge,
  buildResolved,
  buildTracks,
  installEngineAndTracks,
  resetAll,
} from "./_helpers.mjs";

async function boot() {
  const dom = installDom();
  const raf = installRaf();
  const br = installBridge({ withReply: true });
  const tracks = buildTracks();
  installEngineAndTracks(tracks);
  const { createRenderHost } = await import("../src/render-host.js");
  const { createRecord } = await import("../src/modes/record.js");
  const { createBridge } = await import("../src/bridge.js");
  const host = createRenderHost({
    engine: globalThis.__nfEngine,
    tracks: globalThis.__nfTrackHost,
    mount: dom.body,
    resolved: buildResolved(),
  });
  host.render();
  const bridge = createBridge();
  return { dom, raf, host, bridge, createRecord, bridgeMock: br };
}

test("record: __nfTick is installed on global", async (t) => {
  t.after(resetAll);
  const { host, bridge, createRecord } = await boot();
  const rec = createRecord({ host, bridge });
  assert.equal(typeof globalThis.__nfTick, "function");
  rec.dispose();
  assert.notStrictEqual(globalThis.__nfTick, rec.tick);
});

test("record: tick renders and resolves after double-RAF", async (t) => {
  t.after(resetAll);
  const { raf, host, bridge, createRecord } = await boot();
  const rec = createRecord({ host, bridge });
  const p = rec.tick(1.5);
  // Before any RAF flush the promise is pending.
  let settled = false;
  p.then(() => { settled = true; });
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  // First RAF flush — inner raf scheduled.
  raf.flush();
  await new Promise((r) => setImmediate(r));
  assert.equal(settled, false);
  // Second RAF flush — promise should resolve.
  raf.flush();
  const result = await p;
  assert.equal(result.t, 1.5);
  assert.equal(result.frame, 1);
  assert.equal(host.getT(), 1.5);
});

test("record: frame_ready posted to bridge after tick", async (t) => {
  t.after(resetAll);
  const { raf, host, bridge, bridgeMock, createRecord } = await boot();
  const rec = createRecord({ host, bridge });
  const p = rec.tick(0.25);
  raf.flush();
  raf.flush();
  await p;
  const frameReady = bridgeMock.sent.find((m) => m.kind === "frame_ready");
  assert.ok(frameReady, "frame_ready should be posted");
  assert.equal(frameReady.payload.t, 0.25);
  assert.equal(frameReady.payload.frame, 1);
});

test("record: no internal RAF loop (queue stays empty without tick)", async (t) => {
  t.after(resetAll);
  const { raf, host, bridge, createRecord } = await boot();
  createRecord({ host, bridge });
  assert.equal(raf.queue.length, 0);
  // Flush produces nothing — no self-driven loop.
  raf.flush();
  assert.equal(raf.queue.length, 0);
});

test("record: survives missing bridge (frame_ready swallowed)", async (t) => {
  t.after(resetAll);
  const dom = installDom();
  const raf = installRaf();
  installEngineAndTracks(buildTracks());
  const { createRenderHost } = await import("../src/render-host.js");
  const { createRecord } = await import("../src/modes/record.js");
  const host = createRenderHost({
    engine: globalThis.__nfEngine,
    tracks: globalThis.__nfTrackHost,
    mount: dom.body,
    resolved: buildResolved(),
  });
  host.render();
  const rec = createRecord({ host, bridge: null });
  const p = rec.tick(0.5);
  raf.flush();
  raf.flush();
  const result = await p;
  assert.equal(result.t, 0.5);
});
