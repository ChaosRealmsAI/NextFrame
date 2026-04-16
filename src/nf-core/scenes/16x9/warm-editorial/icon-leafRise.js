// scenes/16x9/warm-editorial/icon-leafRise.js
// Leaf rise — rise behavior fade + float up into place.

export default {
  id: "leafRise",
  name: "叶子浮现",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "overlay",
  description: "叶子从下方浮现 — rise behavior (offset y:80→0 + opacity 0→1)，outBack 有轻弹",
  duration_hint: 1,
  type: "dom",
  frame_pure: false,
  assets: [],
  intent: `
    warm-editorial 主题的"自然出现"装饰组件。设计取舍：
    1. rise behavior — offset y 从 +80px 浮上到 0，opacity 渐显，整体"生长感"。
    2. 绿色 #5a8a6a — 主题 green 色，叶子传达"生机/自然/成长"。
    3. 叶子 shape 不对称 — 现有 SVG path 是左侧突起的叶形，自然不机械。
    4. 1s duration 略长于 pop/dart — rise 是温柔浮现，不是瞬间出现。
    5. 适合"读书到自然章节 / 生活方式内容 / 季节主题"。
  `,
  when_to_use: ["自然/植物/季节主题的章节装饰", "旁白中提到『生长』『萌芽』『自然』时", "书评视频秋冬季特辑"],
  when_not_to_use: ["科技/金融/严肃学术内容（绿色语义不匹配）"],
  limitations: ["叶子方向固定（左侧突起），如需对称需改 shape 或 scale x: -1"],
  inspired_by: "纸质书的手绘藤蔓装饰 / Apple 系统『提醒事项』回收动画",
  used_in: [],
  requires: [],
  pairs_well_with: ["content-editorial", "bg-warmGlow"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "light",
  z_layer: "foreground",
  mood: ["calm", "warm"],
  tags: ["motion", "leaf", "rise", "nature"],
  complexity: "simple",
  performance: "light",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    color: { type: "color", default: "#5a8a6a", semantic: "叶子填充色" },
    duration: { type: "number", default: 1, semantic: "rise 时长" },
  },
  enter: null,
  exit: null,
  render(host, t, params, _vp) {
    const color = params.color || "#5a8a6a";
    const duration = Number(params.duration) || 1;
    const p = clamp01(t / duration);
    const opacity = interpFrames([[0, 0], [0.45, 1, "out"], [1, 1, "linear"]], p);
    const y = interpFrames([[0, 80], [1, 0, "outBack"]], p);
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%" style="position:absolute;inset:0;display:block"><g transform="translate(200 ${(200 + y).toFixed(3)}) scale(1.6)" opacity="${opacity.toFixed(3)}"><path d="${LEAF_PATH}" fill="${escapeAttr(color)}"/></g></svg>`;
  },
  describe(t, params, vp) {
    return { sceneId: "leafRise", phase: t < 1 ? "rising" : "settled", progress: Math.min(1, t / 1), visible: true, params, viewport: vp };
  },
  sample() {
    return { color: "#5a8a6a", duration: 1 };
  },
};

const LEAF_PATH = "M-42,18C-20,-40 18,-60 58,-54C52,-16 30,20 -18,46C2,20 14,0 22,-22C4,-2 -16,12 -42,18Z";

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function easeOutQuad(value) {
  const p = clamp01(value);
  return 1 - (1 - p) * (1 - p);
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
    const [t1, v1, ease = "out"] = frames[i + 1];
    if (p > t1) continue;
    const local = clamp01((p - t0) / Math.max(0.0001, t1 - t0));
    const eased = ease === "outBack" ? easeOutBack(local) : easeOutQuad(local);
    return v0 + (v1 - v0) * eased;
  }
  return frames[frames.length - 1][1];
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
