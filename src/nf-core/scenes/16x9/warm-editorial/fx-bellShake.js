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
  type: "dom",
  frame_pure: false,
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
  render(host, t, params, _vp) {
    const color = params.color || "#8b6b4a";
    const duration = Number(params.duration) || 1.2;
    const p = clamp01(t / duration);
    const rotate = interpFrames([[0, 0], [0.22, 12, "out"], [0.45, -10.2, "out"], [0.7, 5.4, "out"], [1, 0, "out"]], p);
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%" style="position:absolute;inset:0;display:block"><g transform="translate(200 210) rotate(${rotate.toFixed(3)}) scale(1.8)"><path d="${BELL_PATH}" fill="${escapeAttr(color)}"/></g></svg>`;
  },
  describe(t, params, vp) {
    return { sceneId: "bellShake", phase: t < 1.2 ? "wobbling" : "rest", progress: Math.min(1, t / 1.2), visible: true, params, viewport: vp };
  },
  sample() {
    return { color: "#8b6b4a", duration: 1.2 };
  },
};

const BELL_PATH = "M0,-54C22,-54 38,-38 38,-12V12C38,22 44,32 52,38H-52C-44,32 -38,22 -38,12V-12C-38,-38 -22,-54 0,-54ZM-14,50H14C11,61 5,66 0,66C-5,66 -11,61 -14,50Z";

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function easeOutQuad(value) {
  const p = clamp01(value);
  return 1 - (1 - p) * (1 - p);
}

function interpFrames(frames, p) {
  if (p <= frames[0][0]) return frames[0][1];
  for (let i = 0; i < frames.length - 1; i++) {
    const [t0, v0] = frames[i];
    const [t1, v1, ease = "out"] = frames[i + 1];
    if (p > t1) continue;
    const local = clamp01((p - t0) / Math.max(0.0001, t1 - t0));
    const eased = ease === "out" ? easeOutQuad(local) : local;
    return v0 + (v1 - v0) * eased;
  }
  return frames[frames.length - 1][1];
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
