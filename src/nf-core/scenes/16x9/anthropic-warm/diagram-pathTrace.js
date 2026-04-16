export default {
  id: "pathTrace",
  name: "pathTrace",
  version: "1.0.0",
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",
  description: "SVG 路径描边动画 — stroke-dashoffset 纯 t 驱动，可做流程线/因果线/连接轨迹",
  duration_hint: 2.2,
  type: "motion",
  frame_pure: true,
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
  render(host, _t, params, vp) {
    void host;
    const W = vp.width;
    const H = vp.height;
    const duration = Number(params.duration) || 2.2;
    const path = "M-300,40C-236,-82 -122,-84 -38,-6C18,46 82,70 154,20C206,-16 246,-46 300,-28";
    return {
      duration,
      size: [W, H],
      layers: [
        { type: "shape", shape: "path", at: [W * 0.5, H * 0.52], path, size: 100, stroke: params.baseColor || "rgba(245,236,224,.14)", strokeWidth: 10, dasharray: 620, dashoffset: 0 },
        { type: "shape", shape: "path", at: [W * 0.5, H * 0.52], path, size: 100, stroke: params.color || "#da7756", strokeWidth: 10, linecap: "round", linejoin: "round", tracks: { dasharray: [[0, 620], [duration, 620, "linear"]], dashoffset: [[0, 620], [duration * 0.82, 0, "out"]], opacity: [[0, 1], [duration, 1, "linear"]] } },
        { type: "shape", shape: "dot", at: [W * 0.8125, H * 0.494], size: 28, fill: params.color || "#da7756", behavior: "pop", startAt: 1.45, duration: 0.55 },
      ],
    };
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
