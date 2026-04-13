import { toNumber, clamp, resolveAssetUrl } from "../scenes-v2-shared.js";

/**
 * videoClip — embeds a video, frame-synced to timeline time.
 *
 * Video is ALWAYS muted in this component — audio comes from a separate
 * audioTrack layer pointing to the same file. This avoids play/seek conflicts.
 *
 * In browser preview: seeks each frame via currentTime.
 * In recording mode: same, recorder captures via screenshot.
 */
export default {
  id: "videoClip",
  type: "media",
  name: "Video Clip",
  category: "Media",
  tags: ["video", "media", "background-video", "clip", "playback", "footage"],
  description: "全屏播放视频素材的媒体场景组件",
  params: {
    src:       { type: "string", default: "",      desc: "视频文件路径或 URL" },
    poster:    { type: "string", default: "",      desc: "封面图路径或 URL" },
    objectFit: { type: "string", default: "cover", desc: "填充模式：cover / contain / fill" },
    offset:    { type: "number", default: 0,       desc: "视频起始时间偏移（秒）", min: 0 },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const video = document.createElement("video");
    video.style.cssText = [
      "position:absolute;inset:0;width:100%;height:100%",
      `object-fit:${params.objectFit || "cover"}`,
      "display:block;background:#000",
    ].join(";");
    video.playsInline = true;
    video.muted = true; // always muted — audio via audioTrack
    video.preload = "auto";
    const resolvedPoster = resolveAssetUrl(params.poster);
    const resolvedSrc = resolveAssetUrl(params.src);
    if (resolvedPoster) video.poster = resolvedPoster;
    if (resolvedSrc) video.src = resolvedSrc;

    const applyPendingSeek = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        return;
      }
      const pendingSeek = toNumber(video.dataset.nfPendingSeek, NaN);
      if (!Number.isFinite(pendingSeek)) {
        return;
      }
      video.currentTime = clamp(pendingSeek, 0, Math.max(0, video.duration - 0.05));
    };
    video.addEventListener("loadedmetadata", applyPendingSeek);
    container.appendChild(video);
    return { video, applyPendingSeek };
  },

  update(state, localT, params) {
    const { video } = state;
    const t = toNumber(localT, 0);
    const offset = toNumber(params?.offset, 0);
    const rawTarget = Math.max(0, offset + t);
    video.dataset.nfPendingSeek = String(rawTarget);
    if (!video.duration || !Number.isFinite(video.duration)) return;
    const target = clamp(rawTarget, 0, Math.max(0, video.duration - 0.05));
    // Seek every frame — video is muted so no audio stutter
    if (Math.abs(video.currentTime - target) > 0.04) {
      video.currentTime = target;
    }
  },

  destroy(state) {
    const { video, applyPendingSeek } = state;
    video.removeEventListener("loadedmetadata", applyPendingSeek);
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  },
};
