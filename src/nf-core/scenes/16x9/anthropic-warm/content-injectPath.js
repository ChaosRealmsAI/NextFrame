// scenes/16x9/anthropic-warm/content-injectPath.js
//
// 注入路径表 - mono 槽位名 → 箭头 → sans 说明，讲清一个维度"注入到哪里"

export default {
  // ===== Identity =====
  id: "injectPath",
  name: "注入路径表",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "多行「mono 槽位名 → 箭头 → sans 人话说明」，专讲某维度的注入点",
  duration_hint: 5,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding =====
  intent: `
    E01 的 15 个维度讲解核心动作：「谁往哪个槽位塞了什么」。
    这个动作反复出现——§13 (DYNAMIC_BOUNDARY 线上/线下)、§18 (Memory 两个注入点)、
    §21 (Skill 三个注入点)、§24 (Hook → messages[])、§27 (MCP 横跨三槽位)、§29 (env → system[])。
    每讲一个维度都要说"它是怎么进到那四个槽位里的"——注入路径表 = 这个叙事动作的专属组件。
    视觉：一个 ghost 底卡（rgba(245,236,224,.04)），内含 2-6 行；
    每行三段式：
      左列 mono ac 橙 #da7756（如 "system[]" "messages[0]" "tools[]"）min-width=260 右对齐——锚点对齐感
      中间 → 箭头 ink-75 mono
      右列 sans ink 说明，支持 <em>（自动染 ink-75 小一号）承载"备注/括号里的解释"
    与 fourSlots 的分工：fourSlots 说"四个槽位是什么"（总览），injectPath 说"这个维度怎么进去的"（细节）。
    两者经常上下同屏或上下 slide 出现。
  `,

  when_to_use: [
    "每个维度讲解 slide 的注入点总结（E01 §13/18/21/24/27/29）",
    "需要明确展示「X 被写进 Y」的任何技术解释",
    "Memory/Skill/Hook 这种「多点注入」的维度必用",
  ],

  when_not_to_use: [
    "注入只有 1 个点——直接用文字说明即可，上组件反而笨重",
    "行数 > 6——改成 content-keyPoints 或拆页",
    "关系是时间流（A 之后 B 之后 C）——用 flow 组件，箭头不是此处的『到』意思",
  ],

  limitations: [
    "rows 建议 2-6，少于 2 没必要，多于 6 会被裁",
    "key 列 min-width 固定 26% viewport，超长 key 会撑宽",
    "不支持多列右列（右列单行文案，note 用 em 做二级信息）",
  ],

  inspired_by: "Anthropic doc 的 schema 表 + Rust error message 的 note 风格",
  used_in: [
    "claude-code-源码讲解 E01 Slide 06（Memory 两个注入点）",
    "claude-code-源码讲解 E01 Slide 07（Skill 三个注入点）",
    "claude-code-源码讲解 E01 Slide 10（MCP 横跨三槽位）",
  ],

  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "chrome-dimNav", "content-fourSlots"],
  conflicts_with: [],
  alternatives: ["content-keyPoints（无左锚列）", "content-fourSlots（结构化四格）"],

  visual_weight: "medium",
  z_layer: "content",
  mood: ["technical", "structured"],

  tags: ["schema", "injection", "routing", "arrow-list", "technical", "two-column"],

  complexity: "simple",
  performance: { cost: "low", notes: "static DOM list, no animation" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — mono-key arrow sans-value path rows" },
  ],

  // ===== Params =====
  params: {
    title: {
      type: "string",
      default: "",
      semantic: "可选标题，如「Skill 三个注入点」「Memory 注入路径」",
    },
    rows: {
      type: "array",
      required: true,
      semantic: "每项 { key: 'messages[0]', value: '九层合并结果', note?: '项目级+用户级' }，2-6 行",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const rows = Array.isArray(params.rows) ? params.rows.slice(0, 6) : [];
    const title = params.title || "";
    const w = vp.width;
    const h = vp.height;

    const cardW = Math.round(w * 0.573);           // ~1100px
    const padV = Math.round(h * 0.044);
    const padH = Math.round(w * 0.029);
    const cardLeft = Math.round((w - cardW) / 2);
    const cardTop = Math.round(h * 0.22);

    const keySize = Math.round(w * 0.0135);        // ~26px mono
    const arrowSize = Math.round(w * 0.0115);      // ~22px mono
    const valueSize = Math.round(w * 0.0135);      // ~26px sans
    const noteSize = Math.round(w * 0.0115);       // ~22px sans
    const titleSize = Math.round(w * 0.0125);      // ~24px

    const keyColW = Math.round(w * 0.15);          // ~288px right-aligned

    const rowsHtml = rows.map((r) => {
      const key = escapeHtml(r.key || "");
      const value = escapeHtml(r.value || "");
      const note = r.note ? escapeHtml(r.note) : "";
      return `
        <div style="
          display:flex;
          align-items:center;
          gap:${Math.round(w*0.0104)}px;
        ">
          <span style="
            color:#da7756;
            font:600 ${keySize}px/1.3 'SF Mono','JetBrains Mono','Fira Code',Consolas,monospace;
            min-width:${keyColW}px;
            text-align:right;
            flex-shrink:0;
          ">${key}</span>
          <span style="
            color:rgba(245,236,224,0.50);
            font:400 ${arrowSize}px/1 'SF Mono','JetBrains Mono','Fira Code',Consolas,monospace;
            flex-shrink:0;
          ">→</span>
          <span style="
            color:#f5ece0;
            font:500 ${valueSize}px/1.4 system-ui,-apple-system,'PingFang SC',sans-serif;
          ">${value}${note ? ` <em style="
            font-style:normal;
            color:rgba(245,236,224,0.60);
            font-size:${noteSize}px;
          ">（${note}）</em>` : ""}</span>
        </div>
      `;
    }).join("");

    const titleHtml = title ? `
      <div style="
        color:rgba(245,236,224,0.75);
        font:600 ${titleSize}px/1.3 system-ui,-apple-system,'PingFang SC',sans-serif;
        letter-spacing:0.04em;
        margin-bottom:${Math.round(h*0.037)}px;
      ">${escapeHtml(title)}</div>
    ` : "";

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${cardLeft}px;
        top:${cardTop}px;
        width:${cardW}px;
        padding:${padV}px ${padH}px;
        background:rgba(245,236,224,0.04);
        border:1px solid rgba(245,236,224,0.10);
        border-radius:12px;
      ">
        ${titleHtml}
        <div style="
          display:flex;
          flex-direction:column;
          gap:${Math.round(h*0.022)}px;
        ">${rowsHtml}</div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    const rows = Array.isArray(params.rows) ? params.rows : [];
    return {
      sceneId: "injectPath",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "title", value: params.title || "" },
        ...rows.map((r, i) => ({
          type: "path-row",
          role: `row-${i}`,
          value: `${r.key} → ${r.value}`,
        })),
      ],
      boundingBox: {
        x: Math.round((vp.width - vp.width * 0.573) / 2),
        y: Math.round(vp.height * 0.22),
        w: Math.round(vp.width * 0.573),
        h: Math.round(vp.height * 0.56),
      },
    };
  },

  sample() {
    return {
      title: "Skill 三个注入点",
      rows: [
        { key: "messages[]", value: "技能清单告诉模型有哪些 Skill 可用" },
        { key: "system[]", value: "Skill 用法指南", note: "静态，全局缓存" },
        { key: "messages[]", value: "SKILL.md 全文注入", note: "调用时才注入" },
      ],
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
