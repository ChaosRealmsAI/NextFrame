export default {
  id: "heartLike",
  name: "heartLike",
  version: "1.0.0",
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "overlay",
  description: "点赞效果 — ripple + burst + heart impact，适合做『喜欢 / 通过 / 命中』的瞬时反馈",
  duration_hint: 2.5,
  type: "motion",
  frame_pure: true,
  assets: [],
  intent: `这是 NF-Motion 首发里最像「一眼就懂」的反馈组件：中心心形先 impact 弹出，随后一圈暖粉 ripple 撑开，最后橙金 sparkle burst 往外炸。它不靠位移动画讲叙事，而是靠「压缩 -> 弹出 -> 外溢」讲情绪释放，所以非常适合点赞、命中、确认、收藏这种 1 秒内要被观众读懂的动作。颜色全部贴 anthropic-warm：心是暖粉，外圈是更浅的粉，粒子是偏金橙，既有温度也不偏赛博。`,
  when_to_use: ["视频里需要一个明确的『喜欢/命中/通过』反馈瞬间", "章节中段想插入一个轻量、高可读的情绪锚点", "做 UI 手势示意时需要一个可循环的小型反馈件"],
  when_not_to_use: ["需要严肃、中性的确认状态", "画面已经有很多粒子或爆炸性元素", "需要持续驻留而不是瞬时爆发"],
  limitations: ["默认是居中单体构图，不适合承载正文", "burst 粒子数量建议 6-12，太多会喧宾夺主", "更适合 1.5-3s 的短时反馈，不适合超长镜头"],
  inspired_by: "社交产品点赞反馈 + Apple/Anthropic 风的暖色 SVG micro-motion",
  used_in: [],
  requires: [],
  pairs_well_with: ["statBig", "glossaryCard", "goldenClose"],
  conflicts_with: [],
  alternatives: ["loadingPulse", "animatedCheck"],
  visual_weight: "medium",
  z_layer: "foreground",
  mood: ["warm", "affirming", "playful"],
  tags: ["motion", "heart", "like", "feedback", "overlay", "anthropic-warm"],
  complexity: "simple",
  performance: { cost: "low", notes: "3 semantic layers expanded by runtime into deterministic SVG" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial NF-Motion launch component from verified POC heart-like config" }],
  params: {
    duration: { type: "number", default: 2.5, semantic: "总时长，建议 2-3 秒" },
    heartColor: { type: "string", default: "gradient:heart", semantic: "心形填充，可用 gradient:heart 或纯色" },
    rippleColor: { type: "color", default: "#ff9ab8", semantic: "外圈 ripple 颜色" },
    burstColor: { type: "color", default: "#ffb44d", semantic: "sparkle burst 颜色" },
  },
  enter: null,
  exit: null,
  render(host, _t, params, vp) {
    void host;
    const W = vp.width;
    const H = vp.height;
    const duration = Number(params.duration) || 2.5;
    const cx = W * 0.5;
    const cy = H * 0.5;
    return {
      duration,
      size: [W, H],
      layers: [
        { type: "ripple", at: [cx, cy], color: params.rippleColor || "#ff9ab8", maxRadius: 200, startAt: 0.4, duration: 0.9 },
        { type: "burst", at: [cx, cy], particles: 8, distance: 180, shape: "sparkle", color: params.burstColor || "#ffb44d", startAt: 0.47, duration: 0.7 },
        { type: "shape", shape: "heart", at: [cx, cy], size: 100, fill: params.heartColor || "gradient:heart", behavior: "impact", startAt: 0, duration: 1.5 },
      ],
    };
  },
  describe(t, params, vp) {
    const duration = Number(params.duration) || 2.5;
    const progress = Math.max(0, Math.min(1, t / duration));
    return {
      sceneId: "heartLike",
      phase: t < 0.45 ? "impact" : t < 1.2 ? "burst" : "settle",
      progress,
      visible: true,
      params,
      elements: [{ type: "heart", role: "primary" }, { type: "ripple", role: "accent" }, { type: "sparkles", role: "burst", count: 8 }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
  sample() {
    return { duration: 2.5, heartColor: "gradient:heart", rippleColor: "#ff9ab8", burstColor: "#ffb44d" };
  },
};
