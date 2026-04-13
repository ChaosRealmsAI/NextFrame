import {
  createRoot, createNode, smoothstep, easeOutCubic, toNumber,
  SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

export default {
  id: "card3d",
  type: "dom",
  name: "3D Card Flip",
  category: "Motion Graphics",
  defaultParams: {
    frontTitle: "Front",
    frontSubtitle: "",
    backContent: "Back side",
    bgColor: "rgba(30,30,50,0.9)",
    rotateAxis: "Y",
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center;perspective:1200px");
    const bgColor = params.bgColor || "rgba(30,30,50,0.9)";
    const axis = (params.rotateAxis || "Y").toUpperCase() === "X" ? "X" : "Y";

    const card = createNode("div", [
      "position:relative;width:360px;height:240px",
      "transform-style:preserve-3d",
      "will-change:transform;opacity:0",
    ].join(";"));

    const faceBase = [
      "position:absolute;inset:0;display:flex;flex-direction:column",
      "align-items:center;justify-content:center;backface-visibility:hidden",
      `background:${bgColor};border-radius:16px`,
      `border:1px solid rgba(255,255,255,0.1)`,
      `box-shadow:0 8px 32px rgba(0,0,0,0.4)`,
      `font-family:${SANS_FONT_STACK}`,
    ].join(";");

    const front = createNode("div", faceBase);
    const title = createNode("div", [
      "font-size:28px;font-weight:700;color:#fff",
      "letter-spacing:-0.01em",
    ].join(";"), params.frontTitle || "Front");
    front.appendChild(title);
    if (params.frontSubtitle) {
      const sub = createNode("div", "font-size:14px;color:rgba(255,255,255,0.5);margin-top:8px", params.frontSubtitle);
      front.appendChild(sub);
    }

    const back = createNode("div", [
      faceBase,
      `transform:rotate${axis}(180deg)`,
    ].join(";"));
    const backText = createNode("div", "font-size:18px;color:rgba(255,255,255,0.8);padding:24px;text-align:center;line-height:1.5", params.backContent || "Back side");
    back.appendChild(backText);

    card.appendChild(front);
    card.appendChild(back);
    root.appendChild(card);
    return { root, card, axis };
  },

  update(els, localT) {
    const fadeIn = smoothstep(0, 0.1, localT);
    const fadeOut = 1 - smoothstep(0.85, 1, localT);
    els.card.style.opacity = fadeIn * fadeOut;

    // 0~0.15: flip from 180 to 0 (back→front), 0.15~0.85: show front (0), 0.85~1: flip to 180
    let deg;
    if (localT < 0.15) {
      const t = easeOutCubic(smoothstep(0, 0.15, localT));
      deg = 180 - t * 180;
    } else if (localT > 0.85) {
      const t = easeOutCubic(smoothstep(0.85, 1, localT));
      deg = t * 180;
    } else {
      deg = 0;
    }
    els.card.style.transform = `rotate${els.axis}(${deg}deg)`;
  },

  destroy(els) { els.root.remove(); },
};
