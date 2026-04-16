// scenes/16x9/warm-editorial/fx-bellShake.js
// Bell shake — wobble behavior emulating a ringing notification.

export default {
  id: "bellShake",
  name: "铃铛摇铃",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "overlay",
  description: "铃铛左右摇摆 — wobble behavior 旋转 0→12°→-10°→5°→0，模拟敲钟提醒",
  duration_hint: 1.2,
  type: "motion",
  frame_pure: true,
  assets: [],
  intent: `
    warm-editorial 主题的"注意事项"视觉提醒组件。设计取舍：
    1. wobble behavior — rotate 先偏 12° 再 -10° 再 5° 再 0，衰减式摆动，物理感自然。
    2. 棕金 #8b6b4a 色 — 主题 ac2，比 ac 更"温和"，不紧张。
    3. size 180px 中等占比 — 铃铛是辅助装饰，不是主角。
    4. 1.2s duration — 摇铃 = 短促，太长变成漂浮。
    5. 适合『新章节开始 / 书中注释 / 读者提醒』类场景。
  `,
  when_to_use: ["新章节开始的视觉提醒", "书中关键注释的标记", "广告/公告类插入"],
  when_not_to_use: ["高频触发（1.2s 内只 wobble 一次，连续用会干扰）", "严肃沉思场景（铃铛太『提醒』感）"],
  limitations: ["wobble 幅度固定 12°，如需更大/更小需改 params.angle"],
  inspired_by: "纸质书的脚注提示标 / 邮件到达通知",
  used_in: [],
  requires: [],
  pairs_well_with: ["content-editorial", "text-chapterTitle"],
  conflicts_with: [],
  alternatives: ["fx-attentionDart"],
  visual_weight: "medium",
  z_layer: "foreground",
  mood: ["warm", "playful"],
  tags: ["motion", "bell", "wobble", "notify"],
  complexity: "simple",
  performance: "light",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    color: { type: "color", default: "#8b6b4a", semantic: "铃铛填充色" },
    duration: { type: "number", default: 1.2, semantic: "wobble 总时长" },
  },
  enter: null,
  exit: null,
  render(_host, _t, params, _vp) {
    const color = params.color || "#8b6b4a";
    const duration = Number(params.duration) || 1.2;
    return {
      duration,
      size: [400, 400],
      layers: [
        {
          type: "shape",
          shape: "bell",
          at: [200, 210],
          size: 180,
          fill: color,
          behavior: "wobble",
          startAt: 0,
          duration,
        },
      ],
    };
  },
  describe(t, params, vp) {
    return { sceneId: "bellShake", phase: t < 1.2 ? "wobbling" : "rest", progress: Math.min(1, t / 1.2), visible: true, params, viewport: vp };
  },
  sample() {
    return { color: "#8b6b4a", duration: 1.2 };
  },
};
