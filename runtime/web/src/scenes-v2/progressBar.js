import {
  createRoot, createNode, smoothstep, easeOutCubic, toNumber, lerp,
  SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

export default {
  id: "progressBar",
  type: "dom",
  name: "Progress Bar",
  category: "Data",
  defaultParams: {
    progress: 75,
    label: "Project Progress",
    color: "#6ee7ff",
    height: 12,
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 12%");
    const color = params.color || "#6ee7ff";
    const barHeight = toNumber(params.height, 12);
    const labelRow = createNode("div", [
      "display:flex",
      "justify-content:space-between",
      "width:100%",
      "max-width:560px",
      "margin-bottom:12px",
      "will-change:opacity",
      "opacity:0",
    ].join(";"));
    const labelEl = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:15px",
      "font-weight:500",
      "color:rgba(255,255,255,0.7)",
      "letter-spacing:0.04em",
    ].join(";"), params.label || "");
    const pctEl = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:15px",
      "font-weight:700",
      `color:${color}`,
      "font-variant-numeric:tabular-nums",
    ].join(";"), "0%");
    labelRow.appendChild(labelEl);
    labelRow.appendChild(pctEl);
    const track = createNode("div", [
      "width:100%",
      "max-width:560px",
      `height:${barHeight}px`,
      "background:rgba(255,255,255,0.08)",
      `border-radius:${barHeight}px`,
      "overflow:hidden",
      "will-change:opacity",
      "opacity:0",
    ].join(";"));
    const fill = createNode("div", [
      `height:100%`,
      "width:0%",
      `background:linear-gradient(90deg, ${color}, ${color}cc)`,
      `border-radius:${barHeight}px`,
      `box-shadow:0 0 16px ${color}44`,
      "will-change:width",
    ].join(";"));
    track.appendChild(fill);
    root.appendChild(labelRow);
    root.appendChild(track);
    return { root, labelRow, pctEl, track, fill, target: toNumber(params.progress, 75) };
  },

  update(els, localT) {
    const exitAlpha = 1 - smoothstep(0.85, 1, localT);
    const showT = smoothstep(0, 0.08, localT);
    els.labelRow.style.opacity = showT * exitAlpha;
    els.track.style.opacity = showT * exitAlpha;
    const fillT = easeOutCubic(smoothstep(0.06, 0.45, localT));
    const pct = lerp(0, els.target, fillT);
    els.fill.style.width = `${pct}%`;
    els.pctEl.textContent = `${Math.round(pct)}%`;
  },

  destroy(els) { els.root.remove(); },
};
