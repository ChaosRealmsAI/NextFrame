import { test } from "node:test";
import assert from "node:assert/strict";
import {
  installDom,
  installRaf,
  buildResolved,
  buildTracks,
  installEngineAndTracks,
  makeClock,
  resetAll,
} from "./_helpers.mjs";

async function boot() {
  const dom = installDom();
  const raf = installRaf();
  const tracks = buildTracks();
  installEngineAndTracks(tracks);
  const { createRenderHost } = await import("../src/render-host.js");
  const { createPlay } = await import("../src/modes/play.js");
  const host = createRenderHost({
    engine: globalThis.__nfEngine,
    tracks: globalThis.__nfTrackHost,
    mount: dom.body,
    resolved: buildResolved(),
  });
  host.render();
  return { dom, raf, host, createPlay };
}

test("play: RAF cycle advances t by elapsed (scaled by playbackRate)", async (t) => {
  t.after(resetAll);
  const { raf, host, createPlay } = await boot();
  const clock = makeClock(1000);
  const player = createPlay({
    host,
    options: {
      now: clock.now,
      raf: globalThis.requestAnimationFrame,
      cancelRaf: globalThis.cancelAnimationFrame,
      playbackRate: 1,
    },
  });
  player.resume();
  assert.equal(player.isRunning(), true);
  // First RAF: dt = 0 (lastNow just set), t stays 0.
  clock.advance(500);
  raf.flush();
  assert.ok(Math.abs(host.getT() - 0.5) < 1e-6, `t should be ~0.5, got ${host.getT()}`);
  clock.advance(250);
  raf.flush();
  assert.ok(Math.abs(host.getT() - 0.75) < 1e-6, `t should be ~0.75, got ${host.getT()}`);
  player.pause();
  assert.equal(player.isRunning(), false);
});

test("play: pause/resume toggles RAF loop", async (t) => {
  t.after(resetAll);
  const { raf, host, createPlay } = await boot();
  const clock = makeClock(0);
  const player = createPlay({
    host,
    options: { now: clock.now },
  });
  player.resume();
  assert.equal(player.isRunning(), true);
  clock.advance(100);
  raf.flush();
  const tAfter = host.getT();
  player.pause();
  assert.equal(player.isRunning(), false);
  clock.advance(1000);
  raf.flush(); // queue should be empty / no progress
  assert.equal(host.getT(), tAfter);
});

test("play: seek jumps directly", async (t) => {
  t.after(resetAll);
  const { host, createPlay } = await boot();
  const player = createPlay({ host, options: { now: () => 0 } });
  player.seek(2.5);
  assert.equal(host.getT(), 2.5);
  assert.equal(player.getT(), 2.5);
});

test("play: setPlaybackRate scales advancement", async (t) => {
  t.after(resetAll);
  const { raf, host, createPlay } = await boot();
  const clock = makeClock(0);
  const player = createPlay({ host, options: { now: clock.now } });
  player.setPlaybackRate(2);
  player.resume();
  clock.advance(500);
  raf.flush();
  assert.ok(Math.abs(host.getT() - 1.0) < 1e-6, `t should be ~1.0, got ${host.getT()}`);
  player.pause();
});

test("play: loopMode=stop ends at duration and calls onEnd", async (t) => {
  t.after(resetAll);
  const { raf, host, createPlay } = await boot();
  const clock = makeClock(0);
  let ended = false;
  const player = createPlay({
    host,
    options: {
      now: clock.now,
      duration: 1,
      loopMode: "stop",
      onEnd: () => { ended = true; },
    },
  });
  player.resume();
  clock.advance(2000); // 2s elapsed, should clamp to duration 1s and stop
  raf.flush();
  assert.equal(ended, true);
  assert.equal(player.isRunning(), false);
  assert.equal(host.getT(), 1);
});
