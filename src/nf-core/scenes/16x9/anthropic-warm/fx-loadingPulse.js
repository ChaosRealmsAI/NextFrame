export default {
  id: "loadingPulse",
  name: "loadingPulse",
  version: "1.0.0",
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "overlay",
  description: "呼吸式加载指示 — 中心圆 pulse，scale 80%↔110% 且 opacity 同步脉动，loop 无缝",
  duration_hint: 2,
  type: "motion",
  frame_pure: true,
  assets: [],
  intent: `很多 loading 组件的问题不是信息不足，而是节奏太硬。这个版本只保留一个中心暖橙圆点和一圈更淡的光环，全部动作交给 motion runtime 的 pulse behavior：从 80% 慢慢鼓到 110%，再回到 80%，首尾同态，所以做 gallery loop 或录制循环都不会跳。它比转圈 spinner 更安静，适合 anthropic-warm 这种深夜书房语气，不会把观众注意力从正文里强行拽走。`,
  when_to_use: ["等待工具调用或思考中的过渡镜头", "需要一个低噪声、可无缝循环的状态提示", "想表达『还在进行，但不焦虑』的节奏"],
  when_not_to_use: ["需要明确百分比或步骤信息", "需要强提醒而不是静默等待", "已经有其他中心主体占位"],
  limitations: ["只表达状态，不表达进度", "默认中心构图，放到边角会失去呼吸感", "建议单独使用，不要和大量文本叠在一起"],
  inspired_by: "Anthropic 官网式安静状态灯 + breathing loader",
  used_in: [],
  requires: [],
  pairs_well_with: ["analogyCard", "slotGrid", "glossaryCard"],
  conflicts_with: [],
  alternatives: ["heartLike", "attentionDart"],
  visual_weight: "light",
  z_layer: "foreground",
  mood: ["calm", "warm", "patient"],
  tags: ["motion", "loading", "pulse", "loop", "overlay", "anthropic-warm"],
  complexity: "simple",
  performance: { cost: "low", notes: "2 circle layers, all properties resolved by interp(track,t)" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial loop-safe pulse loader for NF-Motion launch" }],
  params: {
    duration: { type: "number", default: 2, semantic: "单个呼吸周期时长" },
    color: { type: "color", default: "#da7756", semantic: "主体圆颜色" },
    halo: { type: "color", default: "rgba(218,119,86,.25)", semantic: "外环颜色" },
  },
  enter: null,
  exit: null,
  render(host, _t, params, vp) {
    void host;
    const W = vp.width;
    const H = vp.height;
    const duration = Number(params.duration) || 2;
    const cx = W * 0.5;
    const cy = H * 0.5;
    return {
      duration,
      size: [W, H],
      layers: [
        { type: "shape", shape: "ring", at: [cx, cy], size: 120, stroke: params.halo || "rgba(218,119,86,.25)", strokeWidth: 4, behavior: "pulse", startAt: 0, duration, minScale: 88, maxScale: 118, minOpacity: 0.22, maxOpacity: 0.55 },
        { type: "shape", shape: "circle", at: [cx, cy], size: 58, fill: params.color || "#da7756", behavior: "pulse", startAt: 0, duration, minScale: 80, maxScale: 110, minOpacity: 0.55, maxOpacity: 1 },
      ],
    };
  },
  describe(t, params, vp) {
    const duration = Number(params.duration) || 2;
    return {
      sceneId: "loadingPulse",
      phase: "pulse",
      progress: Math.max(0, Math.min(1, t / duration)),
      visible: true,
      params,
      elements: [{ type: "dot", role: "loading-core" }, { type: "ring", role: "halo" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
  sample() {
    return { duration: 2, color: "#da7756", halo: "rgba(218,119,86,.25)" };
  },
};
