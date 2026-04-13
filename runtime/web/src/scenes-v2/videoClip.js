import { toNumber, clamp } from "../scenes-v2-shared.js";

export default {
  id: "videoClip",
  type: "media",
  name: "Video Clip",
  category: "Media",
  defaultParams: {
    src: "",
    poster: "",
    muted: true,
    loop: false,
    objectFit: "cover",
  },

  create(container, params) {
    const video = document.createElement("video");
    video.style.cssText = [
      "position:absolute;inset:0;width:100%;height:100%",
      `object-fit:${params.objectFit || "cover"}`,
      "display:block;background:#000",
    ].join(";");
    video.playsInline = true;
    video.muted = params.muted !== false;
    video.loop = params.loop === true;
    video.preload = "auto";
    if (params.poster) video.poster = params.poster;
    if (params.src) video.src = params.src;
    container.appendChild(video);
    return video;
  },

  update(video, localT) {
    const t = toNumber(localT, 0);
    if (!video.duration || !Number.isFinite(video.duration)) return;
    const target = clamp(t, 0, video.duration);
    if (Math.abs(video.currentTime - target) > 0.1) {
      video.currentTime = target;
    }
  },

  destroy(video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  },
};
