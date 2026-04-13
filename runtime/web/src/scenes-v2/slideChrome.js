import {
  createRoot, createNode, smoothstep, toNumber,
  SANS_FONT_STACK, SERIF_FONT_STACK,
} from "../scenes-v2-shared.js";

// slideChrome — presentation frame with top bar, title row, progress bar, and subtitles
// type: "dom"
// params:
//   brand, series, ep
//   tag (orange pill), title (serif headline), tagExtra (right-side note)
//   dimNum, totalDims
//   bgColor, accentColor, textColor
//   subtitles: [{start, end, text}]  — normalized 0~1

export default {
  id: "slideChrome",
  type: "dom",
  name: "Slide Chrome",
  category: "Chrome",
  tags: ["slide", "brand", "title", "layout", "chrome", "show"],
  description: "Slide frame with branding, episode label, title, and subtitle area",
  params: {
    brand:       { type: "string", default: "OPC · Wang Yuxuan",                  desc: "Brand name" },
    series:      { type: "string", default: "Claude Code Source Walkthrough",     desc: "Series name" },
    ep:          { type: "string", default: "E01",                                desc: "Episode label" },
    tag:         { type: "string", default: "tools[]",                            desc: "Tag text" },
    title:       { type: "string", default: "Toolbox",                            desc: "Main title" },
    tagExtra:    { type: "string", default: "20+ built-in",                       desc: "Extra tag note" },
    dimNum:      { type: "number", default: 6,                                    desc: "Current dimension index" },
    totalDims:   { type: "number", default: 15,                                   desc: "Total dimensions" },
    bgColor:     { type: "string", default: "#1a1510",                            desc: "Background color" },
    accentColor: { type: "string", default: "#da7756",                            desc: "Accent color" },
    textColor:   { type: "string", default: "#f5ece0",                            desc: "Text color" },
    subtitles:   { type: "array",  default: [],                                   desc: "Subtitle segment array" },
  },
  get defaultParams() {
    const p = {};
    for (const [k, v] of Object.entries(this.params)) p[k] = v.default;
    return p;
  },

  create(container, params) {
    const bg = params.bgColor || "#1a1510";
    const accent = params.accentColor || "#da7756";
    const text = params.textColor || "#f5ece0";
    const dimNum = toNumber(params.dimNum, 6);
    const totalDims = toNumber(params.totalDims, 15);
    const progressPct = Math.round((dimNum / totalDims) * 100);

    const root = createRoot(container, [
      `background:${bg}`,
      "display:flex",
      "flex-direction:column",
    ].join(";"));

    // ══ TOP BAR ═══════════════════════════════════════════════════════
    const topBar = createNode("div", [
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "padding:0 60px",
      "height:56px",
      "flex-shrink:0",
      `border-bottom:1px solid ${accent}20`,
    ].join(";"));

    const leftWrap = createNode("div", [
      "display:flex",
      "align-items:center",
      "gap:12px",
    ].join(";"));

    // Brand dot
    const brandDot = createNode("div", [
      `background:${accent}`,
      "width:8px",
      "height:8px",
      "border-radius:50%",
      "flex-shrink:0",
    ].join(";"));
    leftWrap.appendChild(brandDot);

    const brandEl = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:15px",
      "font-weight:700",
      `color:${text}`,
      "letter-spacing:0.04em",
    ].join(";"), params.brand || "OPC · Wang Yuxuan");
    leftWrap.appendChild(brandEl);

    const sep = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:15px",
      `color:${text}`,
      "opacity:0.25",
    ].join(";"), "·");
    leftWrap.appendChild(sep);

    const seriesEl = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:14px",
      `color:${text}`,
      "opacity:0.45",
      "letter-spacing:0.01em",
    ].join(";"), params.series || "");
    leftWrap.appendChild(seriesEl);

    topBar.appendChild(leftWrap);

    // EP watermark (right)
    const epEl = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:32px",
      "font-weight:800",
      `color:${text}`,
      "opacity:0.07",
      "letter-spacing:0.08em",
      "user-select:none",
    ].join(";"), params.ep || "E01");
    topBar.appendChild(epEl);

    root.appendChild(topBar);

    // ══ TITLE ROW ════════════════════════════════════════════════════
    const titleRow = createNode("div", [
      "display:flex",
      "align-items:center",
      "gap:16px",
      "padding:12px 60px",
      "flex-shrink:0",
      `border-bottom:1px solid ${accent}14`,
    ].join(";"));

    // Tag pill (orange)
    const tagEl = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:13px",
      "font-weight:700",
      `color:${accent}`,
      `background:${accent}1a`,
      `border:1px solid ${accent}44`,
      "border-radius:8px",
      "padding:4px 14px",
      "letter-spacing:0.08em",
      "white-space:nowrap",
      "flex-shrink:0",
    ].join(";"), params.tag || "");
    titleRow.appendChild(tagEl);

    // Title (serif big)
    const titleEl = createNode("span", [
      `font-family:${SERIF_FONT_STACK}`,
      "font-size:30px",
      "font-weight:700",
      `color:${text}`,
      "letter-spacing:0.01em",
      "white-space:nowrap",
    ].join(";"), params.title || "");
    titleRow.appendChild(titleEl);

    // tagExtra (dimmer)
    if (params.tagExtra) {
      const extra = createNode("span", [
        `font-family:${SANS_FONT_STACK}`,
        "font-size:14px",
        "font-weight:400",
        `color:${text}`,
        "opacity:0.4",
        "letter-spacing:0.02em",
      ].join(";"), params.tagExtra);
      titleRow.appendChild(extra);
    }

    root.appendChild(titleRow);

    // ══ CONTENT SPACER (other layers paint here) ═════════════════════
    const contentArea = createNode("div", "flex:1;min-height:0");
    root.appendChild(contentArea);

    // ══ BOTTOM BAR ════════════════════════════════════════════════════
    const bottomBar = createNode("div", [
      "flex-shrink:0",
      "display:flex",
      "flex-direction:column",
      `border-top:1px solid ${accent}14`,
    ].join(";"));

    // Progress track
    const progressTrack = createNode("div", [
      "width:100%",
      "height:6px",
      `background:${accent}18`,
      "position:relative",
      "overflow:hidden",
    ].join(";"));

    const progressFill = createNode("div", [
      "height:100%",
      `width:${progressPct}%`,
      `background:linear-gradient(90deg, ${accent}, ${accent}cc)`,
      "transition:width 0.4s ease",
    ].join(";"));
    progressTrack.appendChild(progressFill);
    bottomBar.appendChild(progressTrack);

    // Subtitle bar
    const subBar = createNode("div", [
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "height:52px",
      "padding:0 80px",
      "position:relative",
    ].join(";"));

    const subText = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:19px",
      "font-weight:400",
      `color:${text}`,
      "opacity:0",
      "text-align:center",
      "line-height:1.5",
      "max-width:1200px",
      "will-change:opacity",
      "transition:opacity 0.25s ease",
    ].join(";"));
    subBar.appendChild(subText);

    // Dim indicator (bottom right)
    const dimEl = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:12px",
      "font-weight:600",
      `color:${text}`,
      "opacity:0.3",
      "position:absolute",
      "right:60px",
      "bottom:14px",
      "letter-spacing:0.06em",
    ].join(";"), `${dimNum} / ${totalDims}`);
    subBar.appendChild(dimEl);

    bottomBar.appendChild(subBar);
    root.appendChild(bottomBar);

    return { root, subText, progressFill, prevIdx: -1 };
  },

  update(els, localT, params) {
    // Fade in/out frame
    const enterT = smoothstep(0, 0.03, localT);
    const exitT = 1 - smoothstep(0.97, 1, localT);
    els.root.style.opacity = enterT * exitT;

    // Subtitle — find active subtitle by normalised time
    const subtitles = Array.isArray(params && params.subtitles)
      ? params.subtitles : [];

    let activeIdx = -1;
    for (let i = 0; i < subtitles.length; i++) {
      const s = subtitles[i];
      if (localT >= s.start && localT <= s.end) {
        activeIdx = i;
        break;
      }
    }

    if (activeIdx < 0) {
      els.subText.style.opacity = "0";
    } else {
      const seg = subtitles[activeIdx];
      if (activeIdx !== els.prevIdx) {
        els.subText.textContent = seg.text || "";
        els.prevIdx = activeIdx;
      }
      const dur = seg.end - seg.start;
      const progress = dur > 0 ? (localT - seg.start) / dur : 1;
      const fadeIn = smoothstep(0, 0.1, progress);
      const fadeOut = smoothstep(1, 0.9, progress);
      els.subText.style.opacity = String(fadeIn * fadeOut * 0.92);
    }
  },

  destroy(els) { els.root.remove(); },
};
