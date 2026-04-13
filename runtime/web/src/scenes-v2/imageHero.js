import { toNumber, clamp, lerp } from "../scenes-v2-shared.js";

export default {
  id: "imageHero",
  type: "media",
  name: "Image Hero",
  category: "Media",
  defaultParams: {
    src: "",
    alt: "",
    objectFit: "cover",
    zoomStart: 1,
    zoomEnd: 1.15,
    panX: 0,
    panY: 0,
  },

  create(container, params) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:absolute;inset:0;overflow:hidden";
    const img = document.createElement("img");
    img.style.cssText = [
      "width:100%;height:100%",
      `object-fit:${params.objectFit || "cover"}`,
      "display:block;will-change:transform",
    ].join(";");
    img.alt = params.alt || "";
    if (params.src) img.src = params.src;
    wrap.appendChild(img);
    container.appendChild(wrap);
    return { wrap, img };
  },

  update(els, localT, params) {
    const duration = toNumber(localT, 0);
    // Normalize to 0-1 over a 10s assumed max, clamped
    const progress = clamp(duration / 10, 0, 1);
    const zoomStart = toNumber(params.zoomStart, 1);
    const zoomEnd = toNumber(params.zoomEnd, 1.15);
    const panX = toNumber(params.panX, 0);
    const panY = toNumber(params.panY, 0);
    const scale = lerp(zoomStart, zoomEnd, progress);
    const tx = panX * progress;
    const ty = panY * progress;
    els.img.style.transform = `scale(${scale}) translate(${tx}px, ${ty}px)`;
  },

  destroy(els) { els.wrap.remove(); },
};
