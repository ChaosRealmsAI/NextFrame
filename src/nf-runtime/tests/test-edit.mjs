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
  installRaf();
  const br = installBridge({ withReply: true });
  const tracks = buildTracks();
  installEngineAndTracks(tracks);
  const { createRenderHost } = await import("../src/render-host.js");
  const { createEdit } = await import("../src/modes/edit.js");
  const { createBridge } = await import("../src/bridge.js");
  const host = createRenderHost({
    engine: globalThis.__nfEngine,
    tracks: globalThis.__nfTrackHost,
    mount: dom.body,
    resolved: buildResolved(),
  });
  host.render();
  const bridge = createBridge();
  return { dom, host, bridge, createEdit, bridgeMock: br };
}

test("edit: seek(t) sets t and re-renders", async (t) => {
  t.after(resetAll);
  const { host, bridge, createEdit } = await boot();
  const editor = createEdit({ host, bridge });
  assert.equal(host.getT(), 0);
  editor.seek(3.5);
  assert.equal(host.getT(), 3.5);
  assert.equal(editor.getT(), 3.5);
});

test("edit: setProps mutates resolved copy and emits writeback_request", async (t) => {
  t.after(resetAll);
  const { host, bridge, createEdit } = await boot();
  const editor = createEdit({ host, bridge });
  const events = [];
  editor.addEventListener("writeback_request", (e) => events.push(e));
  editor.setProps("t1", "props.color", "red");
  const resolved = host.getResolved();
  const t1 = resolved.tracks.find((tr) => tr.id === "t1");
  assert.equal(t1.props.color, "red");
  assert.equal(events.length, 1);
  assert.equal(events[0].detail.trackId, "t1");
  assert.equal(events[0].detail.value, "red");
});

test("edit: diff tracks changes from initial", async (t) => {
  t.after(resetAll);
  const { host, bridge, createEdit } = await boot();
  const editor = createEdit({ host, bridge });
  assert.deepEqual(editor.diff(), []);
  editor.setProps("t1", "props.color", "red");
  editor.setProps("t2", "props.color", "blue");
  const d = editor.diff();
  assert.equal(d.length, 2);
  const paths = d.map((x) => x.path).sort();
  assert.deepEqual(paths, ["tracks.0.props.color", "tracks.1.props.color"]);
});

test("edit: requestWriteBack sends source_writeback to bridge", async (t) => {
  t.after(resetAll);
  const { host, bridge, createEdit, bridgeMock } = await boot();
  const editor = createEdit({ host, bridge });
  editor.setProps("t1", "props.color", "red");
  const res = await editor.requestWriteBack();
  assert.equal(res.ok, true);
  assert.equal(bridgeMock.sent.length, 1);
  assert.equal(bridgeMock.sent[0].kind, "source_writeback");
  assert.equal(bridgeMock.sent[0].payload.diff.length, 1);
  assert.equal(bridgeMock.sent[0].payload.diff[0].to, "red");
});

test("edit: resetInitial makes current state the new baseline", async (t) => {
  t.after(resetAll);
  const { host, bridge, createEdit } = await boot();
  const editor = createEdit({ host, bridge });
  editor.setProps("t1", "props.color", "red");
  assert.equal(editor.diff().length, 1);
  editor.resetInitial();
  assert.deepEqual(editor.diff(), []);
});
