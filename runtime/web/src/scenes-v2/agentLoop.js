import {
  createRoot, createNode, smoothstep, easeOutCubic, toNumber, SANS_FONT_STACK,
} from "../scenes-v2-shared.js";

const DEFAULT_STEPS = [
  { label: "THINK", icon: "🧠", color: "#a78bfa" },
  { label: "ACT", icon: "⚡", color: "#6ee7ff" },
  { label: "OBSERVE", icon: "👁", color: "#34d399" },
  { label: "REPEAT", icon: "🔄", color: "#f9a8d4" },
];

export default {
  id: "agentLoop",
  type: "dom",
  name: "Agent Loop",
  category: "Data Viz",
  defaultParams: {
    steps: DEFAULT_STEPS,
    title: "Tool Use Loop",
    accentColor: "#a78bfa",
    ringColor: "rgba(167,139,250,0.25)",
  },

  create(container, params) {
    const root = createRoot(
      container,
      "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:32px;padding:40px"
    );

    const steps = (params.steps || DEFAULT_STEPS);
    const accentColor = params.accentColor || "#a78bfa";
    const title = params.title || "Tool Use Loop";

    // Title
    const titleEl = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:22px",
      "font-weight:700",
      `color:${accentColor}`,
      "letter-spacing:0.12em",
      "text-transform:uppercase",
      "opacity:0",
      "will-change:opacity,transform",
    ].join(";"), title);
    root.appendChild(titleEl);

    // Loop container — circular layout
    const loopWrap = createNode("div", [
      "position:relative",
      "width:420px",
      "height:420px",
      "flex-shrink:0",
    ].join(";"));

    // Center circle
    const center = createNode("div", [
      "position:absolute",
      "left:50%",
      "top:50%",
      "transform:translate(-50%,-50%)",
      "width:90px",
      "height:90px",
      "border-radius:50%",
      `border:2px solid ${accentColor}`,
      "background:rgba(167,139,250,0.08)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      `font-family:${SANS_FONT_STACK}`,
      "font-size:11px",
      "font-weight:700",
      "color:#fff",
      "letter-spacing:0.1em",
      "text-align:center",
      "opacity:0",
      "will-change:opacity,transform",
    ].join(";"), "AGENT");
    loopWrap.appendChild(center);

    // SVG for arrows
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 420 420");
    svg.style.cssText = "position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    steps.forEach((s, i) => {
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
      marker.setAttribute("id", `al-arrow-${i}`);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "8");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
      marker.setAttribute("orient", "auto");
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", "M0,0 L10,5 L0,10 z");
      p.setAttribute("fill", s.color || accentColor);
      marker.appendChild(p);
      defs.appendChild(marker);
    });
    svg.appendChild(defs);

    const cx = 210, cy = 210, r = 150;
    const count = steps.length;
    const arrows = [];
    for (let i = 0; i < count; i++) {
      const a0 = ((i / count) * Math.PI * 2) - Math.PI / 2;
      const a1 = (((i + 1) / count) * Math.PI * 2) - Math.PI / 2;
      const mx = cx + r * Math.cos((a0 + a1) / 2);
      const my = cy + r * Math.sin((a0 + a1) / 2);

      const arcPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
      // Small arc from one step midpoint toward next
      const fromX = cx + r * Math.cos(a0 + 0.35);
      const fromY = cy + r * Math.sin(a0 + 0.35);
      const toX = cx + r * Math.cos(a1 - 0.35);
      const toY = cy + r * Math.sin(a1 - 0.35);
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      arcPath.setAttribute("d", `M${fromX},${fromY} A${r},${r} 0 ${large} 1 ${toX},${toY}`);
      arcPath.setAttribute("fill", "none");
      arcPath.setAttribute("stroke", steps[i].color || accentColor);
      arcPath.setAttribute("stroke-width", "2");
      arcPath.setAttribute("opacity", "0");
      arcPath.setAttribute("marker-end", `url(#al-arrow-${i})`);
      svg.appendChild(arcPath);
      arrows.push(arcPath);
    }
    loopWrap.appendChild(svg);

    // Step nodes
    const nodeEls = steps.map((s, i) => {
      const angle = ((i / count) * Math.PI * 2) - Math.PI / 2;
      const nx = cx + r * Math.cos(angle);
      const ny = cy + r * Math.sin(angle);

      const nodeWrap = createNode("div", [
        "position:absolute",
        "display:flex",
        "flex-direction:column",
        "align-items:center",
        "gap:6px",
        "opacity:0",
        "will-change:opacity,transform",
      ].join(";"));
      nodeWrap.style.left = `${nx}px`;
      nodeWrap.style.top = `${ny}px`;
      nodeWrap.style.transform = "translate(-50%, -50%) scale(0.5)";

      const dot = createNode("div", [
        "width:64px",
        "height:64px",
        "border-radius:50%",
        `background:rgba(255,255,255,0.04)`,
        `border:2px solid ${s.color || accentColor}`,
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "font-size:22px",
        `box-shadow:0 0 20px ${s.color || accentColor}44`,
      ].join(";"), s.icon || "");
      nodeWrap.appendChild(dot);

      const lbl = createNode("div", [
        `font-family:${SANS_FONT_STACK}`,
        "font-size:12px",
        "font-weight:700",
        `color:${s.color || accentColor}`,
        "letter-spacing:0.1em",
        "text-align:center",
        "white-space:nowrap",
      ].join(";"), s.label || "");
      nodeWrap.appendChild(lbl);

      loopWrap.appendChild(nodeWrap);
      return nodeWrap;
    });

    root.appendChild(loopWrap);

    return { root, titleEl, center, nodeEls, arrows };
  },

  update(els, localT, params) {
    const fadeOut = 1 - smoothstep(0.88, 1, localT);
    const count = els.nodeEls.length;

    // Title
    const titleT = smoothstep(0, 0.1, localT);
    els.titleEl.style.opacity = titleT * fadeOut;
    els.titleEl.style.transform = `translateY(${(1 - titleT) * 12}px)`;

    // Center
    const centerT = smoothstep(0.05, 0.18, localT);
    els.center.style.opacity = centerT * fadeOut;
    els.center.style.transform = `translate(-50%, -50%) scale(${0.6 + centerT * 0.4})`;

    // Nodes staggered
    els.nodeEls.forEach((node, i) => {
      const start = 0.1 + i * 0.12;
      const t = smoothstep(start, start + 0.14, localT);
      const ease = easeOutCubic(t);
      node.style.opacity = ease * fadeOut;
      node.style.transform = `translate(-50%, -50%) scale(${0.5 + ease * 0.5})`;
    });

    // Arrows after nodes
    els.arrows.forEach((arrow, i) => {
      const start = 0.2 + i * 0.12;
      const t = smoothstep(start, start + 0.1, localT);
      arrow.setAttribute("opacity", t * fadeOut);
    });
  },

  destroy(els) { els.root.remove(); },
};
