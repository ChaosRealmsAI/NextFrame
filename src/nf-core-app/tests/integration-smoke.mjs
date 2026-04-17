// Integration smoke test: feed a realistic resolved bundle through the full
// app.start() → getStateAt → renderTracks path, using the official text track
// directly (no bundler). Verifies the whole heart is coherent.

import { installGlobalShim, mountRoot } from "./dom-shim.mjs";

installGlobalShim();

const { start } = await import("../src/app.js");
const { registerTrack, clearTrackRegistry } = await import("../src/track-host.js");
const textTrack = await import("../../nf-tracks/official/text.js");

function fresh() {
  const { win, doc } = installGlobalShim();
  clearTrackRegistry();
  const mount = mountRoot(doc);
  return { win, doc, mount };
}

function main() {
  const { win, mount } = fresh();
  registerTrack("text", textTrack);

  const resolved = {
    viewport: { w: 1920, h: 1080, ratio: "16:9" },
    anchors: { intro_start: 0, intro_end: 3000 },
    tracks: [
      {
        kind: "text",
        id: "title",
        in: 0,
        out: 3,
        keyframes: [
          { t: 0, text: "NextFrame v2.0", x: 0.5, y: 0.5, fontSize: 96, opacity: 0 },
          { t: 1, text: "NextFrame v2.0", x: 0.5, y: 0.5, fontSize: 96, opacity: 1, easing: "ease-out" },
          { t: 3, text: "NextFrame v2.0", x: 0.5, y: 0.5, fontSize: 96, opacity: 1 },
        ],
      },
    ],
  };

  const app = start({ mode: "edit", win, resolved });

  // Initial t=0 → opacity 0, text present
  const s0 = app.getStateAt(0);
  if (s0.tracks.length !== 1) throw new Error("expected 1 active track at t=0");
  if (s0.tracks[0].values.opacity !== 0) throw new Error(`t=0 opacity ${s0.tracks[0].values.opacity}`);

  // Mid fade (t=0.5, relT=0.5, ease-out halfway) → opacity > 0.5
  app.seek(0.5);
  const s05 = app.getStateAt(0.5);
  if (!(s05.tracks[0].values.opacity > 0.5)) {
    throw new Error(`expected ease-out mid > 0.5 got ${s05.tracks[0].values.opacity}`);
  }

  // After out (t=4) → no active tracks
  app.seek(4);
  const s4 = app.getStateAt(4);
  if (s4.tracks.length !== 0) throw new Error(`expected 0 active at t=4, got ${s4.tracks.length}`);
  if (mount.childNodes.length !== 0) {
    throw new Error(`expected 0 DOM tracks at t=4, got ${mount.childNodes.length}`);
  }

  // Purity: two calls with same t deep-equal
  const a = app.getStateAt(1.234);
  const b = app.getStateAt(1.234);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error("purity violation");

  process.stdout.write(JSON.stringify({ ok: true, checks: 5 }) + "\n");
}

main();
