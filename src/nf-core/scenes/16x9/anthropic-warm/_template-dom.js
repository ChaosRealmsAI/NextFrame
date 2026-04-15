// DOM 模板组件 — 复制此文件作为新 dom 类型组件的起点。
// 文件名以 _ 开头，loader 忽略，不会被 nextframe scenes 列出。
//
// DOM 组件与 canvas 组件的唯一差别：
//   render(host, _t, params, vp) — 第一个参数是 HTMLElement 宿主，
//   组件用 host.innerHTML 或 host.appendChild / createElement 挂内容。
//
// 其他字段（11 必填 + 18 AI 理解 + describe + sample）和 canvas 完全一致。

export default {
  // ===== 身份 =====
  id: "templateDom",
  name: "DOM 模板组件",
  version: "0.0.0",

  // ===== 归属 =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== 一句话 =====
  description: "DOM 类组件的最小骨架 — 复制即可起步",
  duration_hint: null,

  // ===== 渲染类型 =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI 理解层 =====
  intent: `
    这是一个 dom 类型的模板示例。核心区别：render(host) 收到 HTMLElement，
    用 host.innerHTML 或 document.createElement 构造内容，配 inline style 写死颜色/字号。
    DOM 的优势：CSS flex/grid 自动布局 + 文字自动换行 + 原生文本选中 + 中文字体系统自动 fallback。
    UI 类组件（卡片/列表/标签/聊天气泡/代码块）默认用 dom，不要默认 canvas。
  `,
  when_to_use: ["写新 dom 组件时复制这个文件", "UI 布局类场景的起步骨架"],
  when_not_to_use: ["需要逐像素效果 / 滤镜 / 粒子 → 用 canvas 模板", "模板文件不要直接注册到 timeline"],
  limitations: ["这是模板，不是可用组件", "id 需要改成真实唯一名称"],
  inspired_by: "标准 React component 骨架 + NextFrame scene v3 契约",
  used_in: [],

  // ===== 配伍 =====
  requires: [],
  pairs_well_with: [],
  conflicts_with: [],
  alternatives: ["text-headline (canvas 模板)"],

  // ===== 视觉权重 =====
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["calm"],

  // ===== 索引 =====
  tags: ["template", "dom", "skeleton", "模板"],

  // ===== 工程 =====
  complexity: "simple",
  performance: { cost: "low", notes: "单次 innerHTML 写入" },
  status: "experimental",
  changelog: [{ version: "0.0.0", date: "2026-04-15", change: "dom 模板" }],

  // ===== 参数契约 =====
  params: {
    title: {
      type: "string",
      required: true,
      semantic: "显示文本",
    },
    color: {
      type: "color",
      default: "#f5ece0",
      semantic: "文字颜色",
    },
  },

  // ===== 动画钩子 =====
  enter: null,
  exit: null,

  // ===== 三函数 =====

  // DOM 类 render — 宿主 host 是一个 HTMLElement。直接写 innerHTML 最简单。
  // 颜色/字号/字体全部写死 inline，保持自包含。
  render(host, _t, params, vp) {
    const color = params.color || "#f5ece0";
    const title = params.title || "";
    // 注意：viewport 用于 % 布局参考，不硬编码 1920/1080
    host.innerHTML = `
      <div style="
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        width: ${vp.width * 0.6}px;
        padding: 48px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        color: ${color};
        font: 600 40px/1.4 system-ui, -apple-system, 'PingFang SC', sans-serif;
        text-align: center;
      ">${escapeHtml(title)}</div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "templateDom",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [{ type: "text", role: "title", value: params.title || "" }],
      boundingBox: {
        x: vp.width * 0.2,
        y: vp.height * 0.4,
        w: vp.width * 0.6,
        h: vp.height * 0.2,
      },
    };
  },

  sample() {
    return { title: "DOM 模板示例", color: "#f5ece0" };
  },
};

// 工具函数内联（禁止 import） — 每个 dom 组件都要自己复制这个
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
