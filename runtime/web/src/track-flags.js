export const TRACK_FLAGS = Object.freeze(["muted", "locked", "solo"]);

export function normalizeTrack(track) {
  const source = track && typeof track === "object" ? track : {};

  return {
    ...source,
    muted: Boolean(source.muted),
    locked: Boolean(source.locked),
    solo: Boolean(source.solo),
    clips: Array.isArray(source.clips) ? source.clips : [],
  };
}

export function normalizeTracks(tracks) {
  return (Array.isArray(tracks) ? tracks : []).map((track) => normalizeTrack(track));
}

export function hasSoloTrack(tracks) {
  return normalizeTracks(tracks).some((track) => track.solo);
}

export function shouldRenderTrack(track, soloActive = false) {
  const normalizedTrack = normalizeTrack(track);
  return !normalizedTrack.muted && (!soloActive || normalizedTrack.solo);
}
