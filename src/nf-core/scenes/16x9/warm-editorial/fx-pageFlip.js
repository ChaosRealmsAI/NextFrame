// scenes/16x9/warm-editorial/fx-pageFlip.js
// Page flip motion — rectangle rotates + fades to mimic turning a book page.

export default {
  id: "pageFlip",
  name: "翻页动效",
  version: "1.0.0",
  ratio: "16:9",
  theme: "warm-editorial",
  role: "overlay",
  description: "NF-Motion 翻页效果 — 矩形纸页从左向右翻转 + 阴影 + 透明度淡出",
  duration_hint: 1.2,
  type: "motion",
  frame_pure: true,
  assets: [],
  intent: `
    warm-editorial 主题的章节切换过渡。设计取舍：
    1. 从中心向右翻转 0→-180° — 模拟翻书的物理动作，观众第一眼懂。
    2. 透明度 1→0.3→0 — 翻页过程中纸页半透明（看到下一页内容），结束完全消失。
    3. 1.2s 时长 — 比 0.6s 有分量，比 2s 拖沓。
    4. 主色 bg3 纸页 + ac2 边缘阴影 — 主题同色系，不抢画面。
    5. behavior 用自定义 tracks（不用 impact）— 翻页不需要弹性，用线性 + outBack 组合。
    6. size [400,400] 让 gallery 缩略图看得清动作。
  `,
  when_to_use: ["章节切换间的过渡", "从一个论点切换到下一个的视觉隐喻", "书评视频从一本书切到下一本"],
  when_not_to_use: ["快节奏内容（1.2s 太慢）", "非书/非文本内容（隐喻不匹配）"],
  limitations: ["需要在 t=0 到 t=1.2s 完整播放，不要中途打断"],
  inspired_by: "iBooks/Kindle 翻页动效 / 实体书翻动的侧视图",
  used_in: [],
  requires: [],
  pairs_well_with: ["text-chapterTitle", "content-editorial"],
  conflicts_with: [],
  alternatives: ["none"],
  visual_weight: "medium",
  z_layer: "foreground",
  mood: ["calm", "literate"],
  tags: ["transition", "page-flip", "book", "motion"],
  complexity: "medium",
  performance: "light",
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    pageColor: { type: "color", default: "#e3ddd3", semantic: "纸页底色" },
    duration: { type: "number", default: 1.2, semantic: "翻页总时长" },
  },
  enter: null,
  exit: null,
  render(_host, _t, params, _vp) {
    const duration = Number(params.duration) || 1.2;
    const pageColor = params.pageColor || "#e3ddd3";
    return {
      duration,
      size: [400, 400],
      layers: [
        {
          type: "shape",
          shape: "square",
          at: [200, 200],
          size: 300,
          fill: pageColor,
          stroke: "#8b6b4a",
          strokeWidth: 1,
          tracks: {
            rotate: [[0, 0], [duration, -160, "outBack"]],
            opacity: [[0, 1], [duration * 0.5, 0.4, "inOut"], [duration, 0, "out"]],
            scale: [[0, [100, 100]], [duration, [60, 100], "inOut"]],
          },
        },
      ],
    };
  },
  describe(t, params, vp) {
    return { sceneId: "pageFlip", phase: t < 1.2 ? "flipping" : "done", progress: Math.min(1, t / 1.2), visible: true, params, viewport: vp };
  },
  sample() {
    return { pageColor: "#e3ddd3", duration: 1.2 };
  },
};
