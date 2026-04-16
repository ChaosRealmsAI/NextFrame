export default {
  id: "attentionDart",
  name: "attentionDart",
  version: "1.0.0",
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "overlay",
  description: "箭头指向 + dart behavior — 从画面外快速滑入目标点，带轻微回弹",
  duration_hint: 1.4,
  type: "motion",
  frame_pure: true,
  assets: [],
  intent: `attentionDart 的目标不是当 icon，而是当『视觉指针』。很多讲解视频在切细节时缺一个明确的注意力导向，观众会自己找焦点，效率很低。这里用一个暖橙箭头从画面外快速 dart 进来，最后轻微 overshoot 再回到目标位，眼睛会天然跟着运动终点停住。再给 target 位放一个小圆点和淡环，就能明确告诉观众“看这里”。它属于功能性动效，不花哨，但非常实用。`,
  when_to_use: ["指向某个 UI 区域、关键词或图表节点", "镜头里需要快速建立观看焦点", "做教程或拆解时引导注意力"],
  when_not_to_use: ["整个画面已经在高速运动", "需要柔和过渡而不是明确指向", "目标区域太靠边导致箭头无法完整展示"],
  limitations: ["默认从左侧入场，如需改方向需调整 fromX/fromY", "箭头适合单目标，不适合多处同时指示", "最好配合留白目标区，不然指向意义会变弱"],
  inspired_by: "演示视频中的 focus arrow callout",
  used_in: [],
  requires: [],
  pairs_well_with: ["analogyCard", "slotGrid", "glossaryCard"],
  conflicts_with: [],
  alternatives: ["pathTrace"],
  visual_weight: "medium",
  z_layer: "foreground",
  mood: ["direct", "useful", "precise"],
  tags: ["motion", "arrow", "dart", "attention", "overlay", "anthropic-warm"],
  complexity: "simple",
  performance: { cost: "low", notes: "arrow, target ring and dot; all frame-pure via motion runtime" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial attention dart pointer for NF-Motion launch" }],
  params: {
    duration: { type: "number", default: 1.4, semantic: "总时长" },
    color: { type: "color", default: "#da7756", semantic: "箭头颜色" },
    targetX: { type: "number", default: 0.72, semantic: "目标点 x，占 viewport 宽度比例" },
    targetY: { type: "number", default: 0.42, semantic: "目标点 y，占 viewport 高度比例" },
  },
  enter: null,
  exit: null,
  render(host, _t, params, vp) {
    void host;
    const W = vp.width;
    const H = vp.height;
    const duration = Number(params.duration) || 1.4;
    const tx = W * (Number(params.targetX) || 0.72);
    const ty = H * (Number(params.targetY) || 0.42);
    return {
      duration,
      size: [W, H],
      layers: [
        { type: "shape", shape: "ring", at: [tx, ty], size: 88, stroke: "rgba(218,119,86,.22)", strokeWidth: 4, behavior: "blink", startAt: 0.82, duration: 0.58, minOpacity: 0.18, maxOpacity: 0.5 },
        { type: "shape", shape: "dot", at: [tx, ty], size: 36, fill: "#da7756", behavior: "pulse", startAt: 0.82, duration: 0.58, minScale: 84, maxScale: 112, minOpacity: 0.5, maxOpacity: 1 },
        { type: "shape", shape: "arrow", at: [tx, ty], size: 118, fill: params.color || "#da7756", rotate: -10, behavior: "dart", startAt: 0, duration: 0.95, fromX: -W * 0.34, fromY: -H * 0.02, distance: W * 0.34 },
      ],
    };
  },
  describe(t, params, vp) {
    const duration = Number(params.duration) || 1.4;
    return {
      sceneId: "attentionDart",
      phase: t < 0.95 ? "dart" : "target",
      progress: Math.max(0, Math.min(1, t / duration)),
      visible: true,
      params,
      elements: [{ type: "arrow", role: "pointer" }, { type: "dot", role: "target" }, { type: "ring", role: "target-accent" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
  sample() {
    return { duration: 1.4, color: "#da7756", targetX: 0.72, targetY: 0.42 };
  },
};
