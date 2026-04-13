import { resolveAssetUrl } from "../scenes-v2-shared.js";

/**
 * audioTrack — plays audio synced to engine timeline.
 *
 * Engine calls update(state, localT) every frame.
 * - Time advancing → play + sync
 * - Time stopped → pause
 * - Time jumped → seek
 *
 * In recording mode, audio is muxed by ffmpeg separately.
 */
export default {
  id: "audioTrack",
  type: "media",
  name: "Audio Track",
  category: "Media",
  tags: ["audio", "music", "sound", "media", "sync", "background"],
  description: "音频轨道，随引擎时间轴同步播放、暂停、定位，支持音量与偏移控制",
  params: {
    src:    { type: "string", default: "",  desc: "音频文件路径或 URL" },
    volume: { type: "number", default: 1,   desc: "音量 (0-1)", min: 0, max: 1 },
    offset: { type: "number", default: 0,   desc: "音频偏移秒数，正值跳过开头" },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const audio = document.createElement("audio");
    audio.preload = "auto";
    audio.style.display = "none";
    const resolvedSrc = resolveAssetUrl(params.src);
    if (resolvedSrc) audio.src = resolvedSrc;
    audio.volume = Math.max(0, Math.min(1, params.volume ?? 1));
    container.appendChild(audio);
    if (resolvedSrc && !window.__audioSrc) {
      window.__audioSrc = resolvedSrc;
    }
    return { audio, prevT: -999, prevWall: 0, wasPlaying: false };
  },

  update(state, localT, params) {
    const { audio } = state;
    if (!audio.src) return;

    // Recording mode — don't play, recorder handles audio
    if (window.__recordingMode) return;

    const offset = params.offset || 0;
    const target = offset + localT;
    const now = performance.now();
    const dt = now - state.prevWall;
    const timeDelta = localT - state.prevT;

    // Detect: is time advancing? (player is playing)
    const isAdvancing = timeDelta > 0.001 && timeDelta < 0.2 && dt < 200;
    // Detect: big jump (slider drag, seek)
    const isJump = Math.abs(timeDelta) > 0.5;

    if (isJump || (!state.wasPlaying && isAdvancing)) {
      // Seek to correct position
      audio.currentTime = target;
    }

    if (isAdvancing) {
      // Playing — keep audio playing, correct drift
      if (audio.paused) {
        audio.currentTime = target;
        audio.play().catch(() => {});
      } else if (Math.abs(audio.currentTime - target) > 0.1) {
        // Drifted too far, re-sync
        audio.currentTime = target;
      }
      state.wasPlaying = true;
    } else if (dt > 100) {
      // Time stopped advancing for >100ms — pause
      if (!audio.paused) {
        audio.pause();
      }
      state.wasPlaying = false;
    }

    audio.volume = Math.max(0, Math.min(1, params.volume ?? 1));
    state.prevT = localT;
    state.prevWall = now;
  },

  destroy(state) {
    state.audio.pause();
    state.audio.removeAttribute("src");
    state.audio.remove();
  },
};
