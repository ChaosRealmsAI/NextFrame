import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { validateAnchors } from "../anchors/validator.js";
import { Fillers } from "../anchors/fillers/index.js";
import { getKind } from "../kinds/index.js";
import type { TimelineV08 } from "../types.js";

function escapeInlineScript(value: string) {
  return String(value)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

async function runFillers(timeline: TimelineV08) {
  for (const [anchorId, entry] of Object.entries(timeline.anchors)) {
    if (!entry?.filler) continue;
    const filler = Fillers.get(entry.filler);
    if (!filler) {
      throw new Error(`NOT_IMPLEMENTED: unknown filler=${entry.filler} for anchor=${anchorId}`);
    }
    await filler(entry, timeline.anchors);
  }
}

function renderMinimalHtml(timeline: TimelineV08) {
  const script = escapeInlineScript(
    `window.__TIMELINE__ = ${JSON.stringify(timeline)}; window.getDuration = () => 0; window.frame_pure = true;`,
  );

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>NextFrame v0.8</title></head><body><div id="app"></div><script>${script}</script></body></html>`;
}

export async function buildV08(timeline: TimelineV08, outPath: string): Promise<void> {
  await runFillers(timeline);
  validateAnchors(timeline.anchors);

  if (timeline.tracks.length > 0) {
    const firstTrack = timeline.tracks[0];
    const schema = getKind(firstTrack.kind);
    if (!schema) {
      throw new Error(`NOT_IMPLEMENTED: builder cannot yet render kind=${firstTrack.kind}`);
    }
    throw new Error(`NOT_IMPLEMENTED: builder cannot yet render kind=${firstTrack.kind}`);
  }

  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, renderMinimalHtml(timeline), "utf8");
}
