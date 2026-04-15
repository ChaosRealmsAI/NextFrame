// scenes/16x9/anthropic-warm/content-fourSlots.js
//
// 四槽位网格 - 2×2 布局，展示 API 请求骨架的四个格子 (system/tools/messages/params)

export default {
  // ===== Identity =====
  id: "fourSlots",
  name: "四槽位网格",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "2×2 网格四个格子，mono 槽位名 + sans 说明，专为讲「四个槽位 = API 请求骨架」设计",
  duration_hint: 6,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding =====
  intent: `
    E01 脚本第二幕整幕只讲一件事——「不管内容多少，API 请求骨架就四个格子」。
    system[] / tools[] / messages[] / params —— 这四个槽位在 E01 的 §5-10 被一一拆开，
    又在 S1/S2/S3 三个 Session 里反复"往里塞东西"。是整集叙事的骨架。
    因此需要一个单独的视觉组件，把这四个格子稳稳立起来，后续所有"注入"都围绕它说事。
    2×2 等高网格，每格独立卡片：mono 槽位名（#da7756 橙，大写感强，像代码）+ sans 人话说明（#f5ece0 ink 正文）。
    卡片间距 gap=32px（对齐网格），让四格之间呼吸感充足但仍是"一组"。
    可选当前高亮（highlight 索引 0-3）——在 §6-9 逐个介绍时按节拍亮起对应格子。
    高亮格子边变 ac 橙 + 外发光，不高亮的保持 ghost 底色。
    参数默认值就是 E01 §5-9 里讲的那四个槽位，sample() 直接抄脚本原话。
  `,

  when_to_use: [
    "E01 Slide 03「四个槽位」总览 + Slide 05-10 逐槽位介绍（带 highlight）",
    "任何需要展示 2×2 结构化分类的场景（提示词槽位 / 4 象限模型）",
    "S1/S2/S3 每轮 API 请求拆解前的骨架复习页",
  ],

  when_not_to_use: [
    "槽位数不是 4 个（3 个用 flow-diagram、5 个以上用 keyPoints）",
    "槽位之间有时序/箭头关系——那是 flow-diagram 的工作",
    "每格内容超过 2 行短句——改用 compareCols 或拆页",
  ],

  limitations: [
    "固定 2×2，不支持 1×4 / 4×1 横条（横条走 pillTags）",
    "每格说明建议 ≤ 30 汉字，超长会换行影响格子等高",
    "highlight 只能单选索引（0-3 或 null），不支持多格同时亮",
  ],

  inspired_by: "API 请求的 schema 截图 + Notion 数据库 kanban 2×2 视图",
  used_in: [
    "claude-code-源码讲解 E01 Slide 03（四槽位总览）",
    "claude-code-源码讲解 E01 Slide 05-10（逐槽位高亮）",
  ],

  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "content-injectPath"],
  conflicts_with: [],
  alternatives: ["content-keyPoints（有序列表）", "content-compareCols（2 格对比）"],

  visual_weight: "high",
  z_layer: "content",
  mood: ["structured", "technical", "systematic"],

  tags: ["grid", "2x2", "slots", "api", "structure", "schema"],

  complexity: "moderate",
  performance: { cost: "low", notes: "static DOM grid, no per-frame updates" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — 2x2 slot grid with optional highlight index" },
  ],

  // ===== Params =====
  params: {
    title: {
      type: "string",
      default: "",
      semantic: "可选标题，如「API 请求的四个槽位」",
    },
    slots: {
      type: "array",
      required: true,
      semantic: "恰好 4 项数组，每项 { key: 'system[]', desc: '你是谁、怎么做' }",
    },
    highlight: {
      type: "number",
      default: -1,
      semantic: "高亮索引 0-3，-1 表示不高亮。讲到第 N 个槽位时设为 N",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const slotsRaw = Array.isArray(params.slots) ? params.slots.slice(0, 4) : [];
    while (slotsRaw.length < 4) slotsRaw.push({ key: "—", desc: "" });
    const title = params.title || "";
    const hl = Number.isInteger(params.highlight) ? params.highlight : -1;
    const w = vp.width;
    const h = vp.height;

    const padX = Math.round(w * 0.05);
    const contentTop = Math.round(h * 0.18);
    const gap = Math.round(w * 0.017);           // ~32px
    const gridW = w - padX * 2;
    const cellW = Math.round((gridW - gap) / 2);
    const cellH = Math.round(h * 0.3);           // ~324px each

    const keySize = Math.round(w * 0.0188);       // ~36px mono
    const descSize = Math.round(w * 0.0146);      // ~28px body
    const titleSize = Math.round(w * 0.0208);

    const cellHtml = slotsRaw.map((s, i) => {
      const active = i === hl;
      const border = active
        ? "1px solid rgba(218,119,86,0.55)"
        : "1px solid rgba(245,236,224,0.10)";
      const bg = active
        ? "rgba(218,119,86,0.08)"
        : "rgba(245,236,224,0.04)";
      const shadow = active
        ? "box-shadow:0 0 40px rgba(218,119,86,0.22);"
        : "";
      const key = escapeHtml(s.key || "");
      const desc = escapeHtml(s.desc || "");
      return `
        <div style="
          width:${cellW}px;
          height:${cellH}px;
          padding:${Math.round(h*0.037)}px ${Math.round(w*0.022)}px;
          background:${bg};
          border:${border};
          border-radius:12px;
          display:flex;
          flex-direction:column;
          justify-content:center;
          gap:${Math.round(h*0.022)}px;
          ${shadow}
        ">
          <div style="
            color:#da7756;
            font:700 ${keySize}px/1.2 'SF Mono','JetBrains Mono','Fira Code',Consolas,monospace;
            letter-spacing:0.02em;
          ">${key}</div>
          <div style="
            color:#f5ece0;
            font:500 ${descSize}px/1.55 system-ui,-apple-system,'PingFang SC',sans-serif;
          ">${desc}</div>
        </div>
      `;
    }).join("");

    const titleHtml = title ? `
      <div style="
        color:rgba(245,236,224,0.75);
        font:600 ${titleSize}px/1.3 system-ui,-apple-system,'PingFang SC',sans-serif;
        margin-bottom:${Math.round(h*0.028)}px;
      ">${escapeHtml(title)}</div>
    ` : "";

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${padX}px;
        top:${contentTop}px;
        width:${gridW}px;
      ">
        ${titleHtml}
        <div style="
          display:grid;
          grid-template-columns:repeat(2,${cellW}px);
          grid-template-rows:repeat(2,${cellH}px);
          gap:${gap}px;
        ">${cellHtml}</div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    const slots = Array.isArray(params.slots) ? params.slots : [];
    return {
      sceneId: "fourSlots",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "title", value: params.title || "" },
        ...slots.map((s, i) => ({
          type: "slot",
          role: `slot-${i}`,
          value: s.key,
          active: i === params.highlight,
        })),
      ],
      boundingBox: {
        x: Math.round(vp.width * 0.05),
        y: Math.round(vp.height * 0.18),
        w: Math.round(vp.width * 0.9),
        h: Math.round(vp.height * 0.66),
      },
    };
  },

  sample() {
    return {
      title: "API 请求的四个槽位",
      slots: [
        { key: "system[]", desc: "你是谁、你该怎么做（员工手册）" },
        { key: "tools[]", desc: "你手里有哪些工具（每个带说明书）" },
        { key: "messages[]", desc: "对话历史 + 系统悄悄塞的东西" },
        { key: "params", desc: "用哪个模型、最多多少 token、思考模式" },
      ],
      highlight: 2,
    };
  },
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
