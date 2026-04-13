import {
  createRoot, createNode, smoothstep, easeOutCubic, toNumber,
  SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

export default {
  id: "numberCounter",
  type: "dom",
  name: "Number Counter",
  category: "Data",
  defaultParams: {
    value: 1234,
    prefix: "",
    suffix: "",
    label: "Total Views",
    color: "#6ee7ff",
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;flex-direction:column;align-items:center;justify-content:center");
    const color = params.color || "#6ee7ff";
    const numWrap = createNode("div", [
      "display:flex",
      "align-items:baseline",
      "gap:0.05em",
      "will-change:transform,opacity",
      "opacity:0",
    ].join(";"));
    const prefix = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:36px",
      "font-weight:300",
      `color:${color}`,
    ].join(";"), params.prefix || "");
    const digits = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:80px",
      "font-weight:900",
      `color:${color}`,
      "letter-spacing:-0.02em",
      `text-shadow:0 0 40px ${color}44`,
      "font-variant-numeric:tabular-nums",
    ].join(";"), "0");
    const suffix = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:36px",
      "font-weight:300",
      `color:${color}`,
      "margin-left:0.1em",
    ].join(";"), params.suffix || "");
    numWrap.appendChild(prefix);
    numWrap.appendChild(digits);
    numWrap.appendChild(suffix);
    const label = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:16px",
      "font-weight:500",
      "color:rgba(255,255,255,0.5)",
      "letter-spacing:0.12em",
      "text-transform:uppercase",
      "margin-top:0.5em",
      "will-change:opacity",
      "opacity:0",
    ].join(";"), params.label || "");
    root.appendChild(numWrap);
    root.appendChild(label);
    return { root, numWrap, digits, label, targetValue: toNumber(params.value, 0) };
  },

  update(els, localT) {
    const exitAlpha = 1 - smoothstep(0.85, 1, localT);
    const enterT = smoothstep(0, 0.1, localT);
    els.numWrap.style.opacity = enterT * exitAlpha;
    els.numWrap.style.transform = `scale(${0.8 + 0.2 * easeOutCubic(enterT)})`;
    const countT = easeOutCubic(smoothstep(0.05, 0.4, localT));
    const current = Math.round(els.targetValue * countT);
    els.digits.textContent = current.toLocaleString();
    const labelT = smoothstep(0.15, 0.25, localT);
    els.label.style.opacity = labelT * exitAlpha;
  },

  destroy(els) { els.root.remove(); },
};
