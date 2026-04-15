// SRT (subtitle) extraction and serialization utilities for build pipeline.

/**
 * Normalize a single SRT cue entry, applying an optional time offset.
 * Returns null if the entry is invalid.
 */
export function normalizeSrtEntry(entry, offset = 0) {
  if (!entry || typeof entry !== "object") return null;
  const start = Number(entry.s ?? entry.start ?? 0) + offset;
  const end = Number(entry.e ?? entry.end ?? start) + offset;
  const text = String(entry.t ?? entry.text ?? "");
  if (!text || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { s: start, e: end, t: text };
}

/**
 * Walk timeline layers and audio metadata to collect all SRT cues.
 * Layer-level `params.srt` takes priority; falls back to audio sentences/segments.
 */
export function extractTimelineSrt(timeline) {
  const layers = Array.isArray(timeline?.layers) ? timeline.layers : [];
  const cues = [];
  for (const layer of layers) {
    const offset = Number(layer?.start || 0);
    // Check flat SRT array (params.srt)
    const srt = Array.isArray(layer?.params?.srt) ? layer.params.srt : null;
    if (srt && srt.length > 0) {
      cues.push(...srt.map((entry) => normalizeSrtEntry(entry, offset)).filter(Boolean));
      continue;
    }
    // Check two-level segments (params.segments from fine.json)
    // Extract all cn[] sub-cues as SRT entries for the recorder's frame skip logic
    const segments = Array.isArray(layer?.params?.segments) ? layer.params.segments : null;
    if (segments && segments.length > 0) {
      for (const seg of segments) {
        if (!seg || typeof seg !== "object") continue;
        const cnArr = Array.isArray(seg.cn) ? seg.cn : [];
        for (const cn of cnArr) {
          if (!cn || typeof cn !== "object") continue;
          const s = Number(cn.s ?? 0) + offset;
          const e = Number(cn.e ?? s) + offset;
          const t = String(cn.text ?? "");
          if (t && Number.isFinite(s) && Number.isFinite(e)) {
            cues.push({ s, e, t });
          }
        }
        // Also add segment-level English as a cue (so recorder knows frame changed)
        if (seg.en && cnArr.length === 0) {
          const s = Number(seg.s ?? 0) + offset;
          const e = Number(seg.e ?? s) + offset;
          if (Number.isFinite(s) && Number.isFinite(e)) {
            cues.push({ s, e, t: String(seg.en) });
          }
        }
      }
    }
  }
  if (cues.length > 0) return cues.sort((left, right) => left.s - right.s || left.e - right.e);

  const audio = timeline?.audio;
  if (!audio || typeof audio === "string") return [];
  const sentences = Array.isArray(audio.sentences)
    ? audio.sentences
    : Array.isArray(audio.segments)
      ? audio.segments.flatMap((segment) => segment?.sentences || [])
      : [];
  return sentences.map((entry) => normalizeSrtEntry(entry)).filter(Boolean);
}

/**
 * Serialize an array of SRT cues into a JS literal string (for inline script).
 */
export function serializeSrtLiteral(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return "[]";
  return `[
${entries.map((entry) => `  { s: ${JSON.stringify(entry.s)}, e: ${JSON.stringify(entry.e)}, t: ${JSON.stringify(entry.t)} }`).join(",\n")}
]`;
}
