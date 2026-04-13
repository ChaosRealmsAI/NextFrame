import {
  clamp,
  toNumber,
  resolveAssetUrl,
  getStageSize,
} from "../scenes-v2-shared.js";

export default {
  id: "audioTrack",
  type: "media",
  name: "Audio Track",
  category: "Media",
  tags: ["audio", "track", "sound", "music", "sync", "playback"],
  description: "Audio playback element synchronized to the engine clock. Corrects drift beyond 0.1s threshold. Pauses when time stops advancing.",

  params: {
    src:    { type: "string", default: "", desc: "Audio source URL or file path" },
    volume: { type: "number", default: 1, desc: "Playback volume (0 to 1)", min: 0, max: 1 },
    offset: { type: "number", default: 0, desc: "Start offset in seconds within the source audio", min: 0, max: 36000 },
  },

  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) {
      p[k] = v.default;
    }
    return p;
  },

  create(container, params) {
    const { width: fallbackW, height: fallbackH } = getStageSize(container);
    const W = Math.max(container.clientWidth || fallbackW, 1);
    const H = Math.max(container.clientHeight || fallbackH, 1);
    const src = resolveAssetUrl(params.src || "");
    const volume = toNumber(params.volume, 1);

    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.style.cssText = "display:none";
    audio.volume = clamp(volume, 0, 1);

    if (src) {
      audio.src = src;
    }

    container.appendChild(audio);

    return { audio, ready: false, lastT: -1, playing: false, duration: 0, W, H };
  },

  update(els, localT, params) {
    const t = clamp(localT);
    const offset = toNumber(params.offset, 0);
    const volume = toNumber(params.volume, 1);
    const audio = els.audio;
    const DRIFT_THRESHOLD = 0.1;

    audio.volume = clamp(volume, 0, 1);

    if (!els.ready && audio.readyState >= 2) {
      els.ready = true;
      els.duration = audio.duration || 0;
    }

    if (!els.ready || els.duration <= 0) {
      return;
    }

    const advancing = t > els.lastT;
    els.lastT = t;

    if (t <= 0 || t >= 1) {
      if (els.playing) {
        audio.pause();
        els.playing = false;
      }
      return;
    }

    const targetTime = offset + t * els.duration;
    const clampedTime = Math.max(0, Math.min(targetTime, els.duration));

    if (!advancing) {
      if (els.playing) {
        audio.pause();
        els.playing = false;
      }
      return;
    }

    const drift = Math.abs(audio.currentTime - clampedTime);
    if (drift > DRIFT_THRESHOLD) {
      audio.currentTime = clampedTime;
    }

    if (!els.playing) {
      const playResult = audio.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch(() => { /* autoplay may be blocked */ });
      }
      els.playing = true;
    }
  },

  destroy(els) {
    const audio = els.audio;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
    }
  },
};
