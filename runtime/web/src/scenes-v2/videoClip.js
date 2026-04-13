import {
  clamp,
  toNumber,
  smoothstep,
  resolveAssetUrl,
  getStageSize,
} from "../scenes-v2-shared.js";

export default {
  id: "videoClip",
  type: "media",
  name: "Video Clip",
  category: "Media",
  tags: ["video", "clip", "media", "embed", "cover", "playback"],
  description: "Embedded video element that stays permanently muted. Syncs playback position to the engine clock via per-frame seek.",

  params: {
    src:       { type: "string", default: "", desc: "Video source URL or file path" },
    objectFit: { type: "string", default: "cover", desc: "CSS object-fit value (cover, contain, fill)" },
    offset:    { type: "number", default: 0, desc: "Start offset in seconds within the source video", min: 0, max: 36000 },
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
    const objectFit = String(params.objectFit || "cover");

    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.style.cssText = [
      "position:absolute",
      "inset:0",
      `width:${W}px`,
      `height:${H}px`,
      `object-fit:${objectFit}`,
      "pointer-events:none",
      "opacity:0",
      "will-change:opacity",
    ].join(";");

    if (src) {
      video.src = src;
    }

    container.appendChild(video);

    return { video, duration: 0, ready: false, lastSeek: -1 };
  },

  update(els, localT, params) {
    const t = clamp(localT);
    const offset = toNumber(params.offset, 0);
    const video = els.video;

    if (!els.ready && video.readyState >= 2) {
      els.ready = true;
      els.duration = video.duration || 0;
    }

    const enterProgress = smoothstep(0, 0.05, t);
    const exitProgress = smoothstep(0.95, 1, t);
    video.style.opacity = String(enterProgress * (1 - exitProgress));

    if (!els.ready || els.duration <= 0) {
      return;
    }

    const targetTime = offset + t * els.duration;
    const clampedTime = Math.max(0, Math.min(targetTime, els.duration - 0.01));

    if (Math.abs(clampedTime - els.lastSeek) > 0.016) {
      video.currentTime = clampedTime;
      els.lastSeek = clampedTime;
    }
  },

  destroy(els) {
    const video = els.video;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
    }
  },
};
