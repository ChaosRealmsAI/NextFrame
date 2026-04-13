import {
  createRoot, createNode, smoothstep, toNumber,
  SANS_FONT_STACK, SERIF_FONT_STACK,
} from "../scenes-v2-shared.js";

// slideFrame — 课件 slide 框架，带顶部品牌栏 + 标题行 + 底部进度条
// Designed for: 深入浅出 Claude Code 源代码 系列
// type: "dom"

export default {
  id: "slideFrame",
  type: "dom",
  name: "Slide Frame",
  category: "Layout",
  defaultParams: {
    brand: "OPC · 王宇轩",
    series: "《深入浅出 Claude Code 源代码》",
    ep: "E01",
    slideTitle: "维度6：工具箱",
    dimNum: 6,
    totalDims: 15,
    bgColor: "#1a1510",
    accentColor: "#da7756",
    textColor: "#f5ece0",
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

    // ── Top brand bar ────────────────────────────────────────────────
    const topBar = createNode("div", [
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "padding:0 40px",
      "height:56px",
      "flex-shrink:0",
      `border-bottom:1px solid ${accent}22`,
      "position:relative",
    ].join(";"));

    const brandEl = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:20px",
      "font-weight:700",
      `color:${text}`,
      "letter-spacing:0.04em",
    ].join(";"), params.brand || "OPC · 王宇轩");

    const epEl = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:38px",
      "font-weight:800",
      `color:${text}`,
      "opacity:0.08",
      "letter-spacing:0.06em",
      "user-select:none",
      "pointer-events:none",
    ].join(";"), params.ep || "E01");

    topBar.appendChild(brandEl);
    topBar.appendChild(epEl);

    // ── Title row ────────────────────────────────────────────────────
    const titleRow = createNode("div", [
      "display:flex",
      "align-items:center",
      "gap:20px",
      "padding:14px 40px",
      "flex-shrink:0",
      `border-bottom:1px solid ${accent}18`,
    ].join(";"));

    const dimBadge = createNode("div", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:13px",
      "font-weight:700",
      `color:${accent}`,
      `background:${accent}18`,
      `border:1px solid ${accent}44`,
      "border-radius:6px",
      "padding:4px 12px",
      "letter-spacing:0.08em",
      "white-space:nowrap",
      "flex-shrink:0",
    ].join(";"), `DIM ${dimNum}/${totalDims}`);

    const seriesEl = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:14px",
      "font-weight:400",
      `color:${text}`,
      "opacity:0.45",
      "letter-spacing:0.01em",
      "white-space:nowrap",
      "overflow:hidden",
      "text-overflow:ellipsis",
    ].join(";"), params.series || "");

    const sep = createNode("span", [
      `font-family:${SANS_FONT_STACK}`,
      "font-size:14px",
      `color:${text}`,
      "opacity:0.2",
      "flex-shrink:0",
    ].join(";"), "·");

    const slideTitleEl = createNode("span", [
      `font-family:${SERIF_FONT_STACK}`,
      "font-size:32px",
      "font-weight:700",
      `color:${text}`,
      "letter-spacing:0.01em",
      "white-space:nowrap",
      "overflow:hidden",
      "text-overflow:ellipsis",
    ].join(";"), params.slideTitle || "");

    titleRow.appendChild(dimBadge);
    titleRow.appendChild(seriesEl);
    titleRow.appendChild(sep);
    titleRow.appendChild(slideTitleEl);

    // ── Content area (middle spacer — overlaid by other layers) ──────
    const contentArea = createNode("div", [
      "flex:1",
      "min-height:0",
      "position:relative",
    ].join(";"));

    // ── Bottom progress bar ──────────────────────────────────────────
    const bottomWrap = createNode("div", [
      "flex-shrink:0",
      "display:flex",
      "flex-direction:column",
      `border-top:1px solid ${accent}18`,
    ].join(";"));

    const progressTrack = createNode("div", [
      "width:100%",
      "height:8px",
      `background:${accent}18`,
      "position:relative",
      "overflow:hidden",
    ].join(";"));

    const progressFill = createNode("div", [
      "height:100%",
      `width:${progressPct}%`,
      `background:${accent}`,
      "transition:width 0.6s ease",
      "will-change:width",
    ].join(";"));

    progressTrack.appendChild(progressFill);
    bottomWrap.appendChild(progressTrack);

    // Assemble
    root.appendChild(topBar);
    root.appendChild(titleRow);
    root.appendChild(contentArea);
    root.appendChild(bottomWrap);

    return { root, progressFill, topBar, titleRow };
  },

  update(els, localT) {
    const alpha = 1 - smoothstep(0.92, 1, localT);
    const enterT = smoothstep(0, 0.08, localT);
    els.root.style.opacity = enterT * alpha;
  },

  destroy(els) { els.root.remove(); },
};
