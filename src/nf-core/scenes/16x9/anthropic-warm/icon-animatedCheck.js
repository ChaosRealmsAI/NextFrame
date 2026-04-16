export default {
  id: "animatedCheck",
  name: "animatedCheck",
  version: "1.0.0",
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",
  description: "勾号描边入场 + pop — stroke-dashoffset 纯 t 驱动，随后整体轻微弹入",
  duration_hint: 1.8,
  type: "motion",
  frame_pure: true,
  assets: [],
  intent: `这个组件解决的是「确认」的可读性问题。单纯把一个 check 放上去太死，单纯做放大又会像廉价 UI 动效，所以这里把两个 verb 叠起来：第一层是路径描边，从 dashoffset=120 走到 0，让观众看到勾号被写出来；第二层是 pop behavior，让整个图标在描边后带一点 overshoot，形成“落地”的确定感。配色用 anthropic-warm 里的 green，不抢主题主色，但在暖棕背景上仍然足够醒目。`,
  when_to_use: ["任务完成、校验通过、状态确认", "讲解流程里需要一个『完成』图标锚点", "列表步骤中的终点确认"],
  when_not_to_use: ["需要表达情绪而不是结果", "需要错误或警告状态", "画面里已经有大量绿色提示"],
  limitations: ["默认是单图标，不承载长文本", "勾号路径长度按 120 近似，换路径时要同步改 dash 值", "更适合 1-2 秒短确认"],
  inspired_by: "iOS 完成态图标 + 手写式 SVG stroke reveal",
  used_in: [],
  requires: [],
  pairs_well_with: ["statBig", "slotGrid", "goldenClose"],
  conflicts_with: [],
  alternatives: ["heartLike"],
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["clear", "confident", "resolved"],
  tags: ["motion", "check", "icon", "success", "path", "anthropic-warm"],
  complexity: "simple",
  performance: { cost: "low", notes: "single check path plus faint backing ring" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial animated check icon for NF-Motion launch" }],
  params: {
    duration: { type: "number", default: 1.8, semantic: "总时长" },
    color: { type: "color", default: "#7ec699", semantic: "勾号颜色" },
    ringColor: { type: "color", default: "rgba(126,198,153,.18)", semantic: "背景圆环颜色" },
  },
  enter: null,
  exit: null,
  render(host, _t, params, vp) {
    void host;
    const W = vp.width;
    const H = vp.height;
    const duration = Number(params.duration) || 1.8;
    const cx = W * 0.5;
    const cy = H * 0.5;
    return {
      duration,
      size: [W, H],
      layers: [
        { type: "shape", shape: "ring", at: [cx, cy], size: 140, stroke: params.ringColor || "rgba(126,198,153,.18)", strokeWidth: 4, behavior: "pop", startAt: 0, duration: 0.8, minOpacity: 0.2 },
        {
          type: "shape",
          shape: "check",
          at: [cx, cy],
          size: 140,
          stroke: params.color || "#7ec699",
          strokeWidth: 12,
          behavior: "pop",
          startAt: 0.12,
          duration: 0.9,
          tracks: { dasharray: [[0, 120], [duration, 120, "linear"]], dashoffset: [[0, 120], [0.9, 0, "out"]], opacity: [[0, 1], [duration, 1, "linear"]] },
        },
      ],
    };
  },
  describe(t, params, vp) {
    const duration = Number(params.duration) || 1.8;
    return {
      sceneId: "animatedCheck",
      phase: t < 0.9 ? "draw" : "settle",
      progress: Math.max(0, Math.min(1, t / duration)),
      visible: true,
      params,
      elements: [{ type: "check", role: "primary" }, { type: "ring", role: "backdrop" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
  sample() {
    return { duration: 1.8, color: "#7ec699", ringColor: "rgba(126,198,153,.18)" };
  },
};
