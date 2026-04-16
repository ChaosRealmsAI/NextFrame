export default {
  id: "pathTrace",
  name: "pathTrace",
  version: "1.0.0",
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",
  description: "SVG 路径描边动画 — stroke-dashoffset 纯 t 驱动，可做流程线/因果线/连接轨迹",
  duration_hint: 2.2,
  type: "dom",
  frame_pure: false,
  assets: [],
  intent: `diagram-pathTrace 是给解释型视频准备的连接线组件。很多图表不是缺节点，而是缺“怎么从 A 走到 B”的视觉过程，所以这里把一条长曲线路径拆成纯 stroke reveal：先用一条很淡的底线给出整体轮廓，再让高亮线通过 dashoffset 从左到右被写出来，终点再点亮一个小圆点，观众会自然把它理解成流程推进、信息传播、依赖链路或思考路径。全程不用 CSS 动画，只依赖 t 和 runtime tracks。`,
  when_to_use: ["讲流程、依赖、因果关系、数据流", "需要一条会『长出来』的连接线", "信息图里想做路径高亮而不是整体闪烁"],
  when_not_to_use: ["只是静态分隔线", "画面里已经有太多细线结构", "需要精确图表标注而不是装配式示意"],
  limitations: ["默认路径长度按 620 近似，换 path 时要同步改 dash 值", "更偏说明性，不适合做强情绪主视觉", "路径以中心布局为主，极端长宽比需要重调 path 数据"],
  inspired_by: "Figma/Keynote 里的 flow arrow reveal + 3B1B 式线条生长感",
  used_in: [],
  requires: [],
  pairs_well_with: ["slotGrid", "analogyCard", "glossaryCard"],
  conflicts_with: [],
  alternatives: ["attentionDart"],
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["explanatory", "precise", "quiet"],
  tags: ["motion", "diagram", "path", "trace", "flow", "anthropic-warm"],
  complexity: "simple",
  performance: { cost: "low", notes: "two path layers plus endpoint dot; dashoffset is frame-pure" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial path trace diagram component for NF-Motion launch" }],
  params: {
    duration: { type: "number", default: 2.2, semantic: "总时长" },
    color: { type: "color", default: "#da7756", semantic: "高亮路径颜色" },
    baseColor: { type: "color", default: "rgba(245,236,224,.14)", semantic: "底路径颜色" },
  },
  enter: null,
  exit: null,
  render(host, t, params, vp) {
    const W = vp.width;
    const H = vp.height;
    const duration = Number(params.duration) || 2.2;
    const path = "M-300,40C-236,-82 -122,-84 -38,-6C18,46 82,70 154,20C206,-16 246,-46 300,-28";
    const traceP = clamp01(t / Math.max(0.001, duration * 0.82));
    const dashoffset = 620 * (1 - easeOutQuad(traceP));
    const dotP = localProgress(t, 1.45, 0.55);
    const dotScale = interpFrames([[0, 0.7], [0.46, 1.2, "outBack"], [0.72, 0.96, "inOut"], [1, 1, "out"]], dotP);
    const dotOpacity = interpFrames([[0, 0], [0.18, 1, "out"], [1, 1, "linear"]], dotP);
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="position:absolute;inset:0;display:block"><g transform="translate(${W * 0.5} ${H * 0.52})"><path d="${path}" fill="none" stroke="${escapeAttr(params.baseColor || "rgba(245,236,224,.14)")}" stroke-width="10"/><path d="${path}" fill="none" stroke="${escapeAttr(params.color || "#da7756")}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="620" stroke-dashoffset="${dashoffset.toFixed(3)}"/></g><circle cx="${W * 0.8125}" cy="${H * 0.494}" r="${(14 * dotScale).toFixed(3)}" fill="${escapeAttr(params.color || "#da7756")}" opacity="${dotOpacity.toFixed(3)}"/></svg>`;
  },
  describe(t, params, vp) {
    const duration = Number(params.duration) || 2.2;
    return {
      sceneId: "pathTrace",
      phase: t < duration * 0.82 ? "trace" : "complete",
      progress: Math.max(0, Math.min(1, t / duration)),
      visible: true,
      params,
      elements: [{ type: "path", role: "base" }, { type: "path", role: "trace" }, { type: "dot", role: "endpoint" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
  sample() {
    return { duration: 2.2, color: "#da7756", baseColor: "rgba(245,236,224,.14)" };
  },
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function localProgress(t, startAt, duration) {
  return clamp01((t - startAt) / Math.max(0.0001, duration));
}

function easeOutQuad(value) {
  const p = clamp01(value);
  return 1 - (1 - p) * (1 - p);
}

function easeInOutQuad(value) {
  const p = clamp01(value);
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function easeOutBack(value) {
  const p = clamp01(value);
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
}

function interpFrames(frames, p) {
  if (p <= frames[0][0]) return frames[0][1];
  for (let i = 0; i < frames.length - 1; i++) {
    const [t0, v0] = frames[i];
    const [t1, v1, ease = "inOut"] = frames[i + 1];
    if (p > t1) continue;
    const local = clamp01((p - t0) / Math.max(0.0001, t1 - t0));
    const eased = ease === "outBack" ? easeOutBack(local)
      : ease === "out" ? easeOutQuad(local)
      : ease === "linear" ? local
      : easeInOutQuad(local);
    return v0 + (v1 - v0) * eased;
  }
  return frames[frames.length - 1][1];
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
