import { test } from "node:test";
import assert from "node:assert/strict";
import { installBridge, resetAll } from "./_helpers.mjs";

test("bridge: sendMessage returns promise via reply handler", async (t) => {
  t.after(resetAll);
  installBridge({ withReply: true });
  const { createBridge } = await import("../src/bridge.js");
  const b = createBridge();
  const res = await b.sendMessage({ kind: "hello", payload: { a: 1 } });
  assert.equal(res.ok, true);
  assert.equal(res.echo.kind, "hello");
  assert.equal(res.echo.payload.a, 1);
});

test("bridge: onMessage receives native-pushed events", async (t) => {
  t.after(resetAll);
  const mock = installBridge();
  const { createBridge } = await import("../src/bridge.js");
  const b = createBridge();
  const seen = [];
  b.onMessage((m) => seen.push(m));
  mock.push({ kind: "progress", payload: 0.5 });
  mock.push({ kind: "done" });
  assert.equal(seen.length, 2);
  assert.equal(seen[0].kind, "progress");
  assert.equal(seen[1].kind, "done");
});

test("bridge: degrades gracefully when webkit missing", async (t) => {
  t.after(resetAll);
  const { createBridge } = await import("../src/bridge.js");
  const b = createBridge();
  assert.equal(b.isAvailable(), false);
  const res = await b.sendMessage({ kind: "frame_ready", payload: { t: 0 } });
  assert.equal(res.ok, false);
  assert.equal(res.error, "no-bridge");
});

test("bridge: rejects when kind missing", async (t) => {
  t.after(resetAll);
  installBridge();
  const { createBridge } = await import("../src/bridge.js");
  const b = createBridge();
  await assert.rejects(() => b.sendMessage({}), /kind required/);
});

test("bridge: __replyTo routing resolves pending promises", async (t) => {
  t.after(resetAll);
  // legacy handler (no reply) — use callback table path
  const sent = [];
  globalThis.webkit = {
    messageHandlers: {
      nfBridge: {
        postMessage(msg) {
          sent.push(typeof msg === "string" ? JSON.parse(msg) : msg);
          /* no return = legacy */
        },
      },
    },
  };
  const { createBridge } = await import("../src/bridge.js");
  const b = createBridge({ timeoutMs: 200 });
  const p = b.sendMessage({ kind: "source_writeback", payload: { foo: 1 } });
  // Simulate native replying.
  const id = sent[0].id;
  globalThis.__nfBridgeReceive({ __replyTo: id, payload: { accepted: true } });
  const res = await p;
  assert.deepEqual(res, { accepted: true });
});
