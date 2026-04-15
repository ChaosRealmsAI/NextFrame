// scenes/16x9/anthropic-warm/content-pillTags.js
//
// 药丸标签 - 无序标签云，每项椭圆胶囊，讲"这一类里有哪些东西"

export default {
  // ===== Identity =====
  id: "pillTags",
  name: "药丸标签",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "多行 pill 胶囊标签，wrap 自动换行，支持 3 种 tone（neutral/accent/muted）",
  duration_hint: 4,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding =====
  intent: `
    E01 反复列出"一类东西里有多少成员"的场景：
    §12 出厂设置 9 段（我是谁 / 规则 / 安全 / 工具 / 语气 / 效率 …）
    §23 Hook 9 个事件点（SessionStart / UserPrompt / PreToolUse …）
    §35 tool_result 8 种变体（文字 / 图片 / 错误 / 超时 …）
    §39 system-reminder 常驻 + 条件触发（CLAUDE.md / 日期 / git / skills …）
    §42 四种压缩方式（整体摘要 / Microcompact / 折叠 / 恢复）
    这些都是"标签云"叙事——顺序不重要、数量很重要、每个都是平级名词。
    用 content-keyPoints 会太重（每项带数字序号显得像流程），用 codeBlock 又不准确。
    pill 胶囊的视觉：ghost 底卡 + 1px 边 + 圆到底的 border-radius (999px)，轻盈不抢戏。
    三种 tone：
    - neutral（默认）：ink-75 文字 + ghost 底 + rule 边，看起来"只是条目"
    - accent：ac 橙文字 + ac-10 底 + ac-25 边，点出"重点条目"（如常驻 vs 可选）
    - muted：ink-50 文字 + ghost 底 + rule 边，看起来"已过时/不推荐/不常用"
    自动 flex-wrap，title 可选（在顶部小标题区）。
    单个 tag ≤ 16 字符视觉最好，20+ 个 tag 也能装下。
  `,

  when_to_use: [
    "「这类东西里有哪些成员」的平级枚举（Hook 事件 / 压缩方式 / tool_result 变体）",
    "章节开头先预告『今天讲的东西』（9 段 / 9 事件 / 8 变体…）",
    "对比「常驻的 vs 触发的」（两个 pillTags 上下排列，tone 不同）",
  ],

  when_not_to_use: [
    "条目之间有优先级 / 顺序——用 content-keyPoints",
    "条目 > 20 个——会挤到每行很密，拆两页",
    "每条需要说明文字——pill 只有名字，带 note 的用 keyPoints",
  ],

  limitations: [
    "不支持 pill 内图标（纯文字）",
    "全组共享一个 tone，不支持逐个 pill 定制色（想单独强调某个——拆成两个 pillTags 错位叠）",
    "tags 数量建议 3-20 之间",
  ],

  inspired_by: "Anthropic doc tag cloud + GitHub topic 标签 + Apple Keynote bullet chip",
  used_in: [
    "claude-code-源码讲解 E01 Slide 04（出厂 9 段）",
    "claude-code-源码讲解 E01 Slide 08（Hook 9 事件）",
    "claude-code-源码讲解 E01 Slide 15（system-reminder 种类）",
  ],

  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "content-keyPoints", "content-analogyCard"],
  conflicts_with: [],
  alternatives: ["content-keyPoints（带序号带说明）", "content-fourSlots（2×2 结构化）"],

  visual_weight: "low",
  z_layer: "content",
  mood: ["light", "enumerative"],

  tags: ["pill", "tags", "chips", "enum", "cloud", "list"],

  complexity: "simple",
  performance: { cost: "low", notes: "pure DOM flex-wrap chips" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — pill chip cloud with 3 tones + optional title" },
  ],

  // ===== Params =====
  params: {
    title: {
      type: "string",
      default: "",
      semantic: "可选标题，如「Hook 的 9 个事件点」",
    },
    tags: {
      type: "array",
      required: true,
      semantic: "字符串数组，或 { text, tone? } 对象数组。tone: neutral|accent|muted，≤ 20 个",
    },
    defaultTone: {
      type: "string",
      default: "neutral",
      semantic: "所有未显式指定 tone 的 pill 用哪个调：neutral|accent|muted",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const w = vp.width;
    const h = vp.height;
    const title = params.title || "";
    const rawTags = Array.isArray(params.tags) ? params.tags.slice(0, 20) : [];
    const defaultTone = params.defaultTone || "neutral";

    const padX = Math.round(w * 0.083);              // ~160px
    const topY = Math.round(h * 0.26);
    const titleSize = Math.round(w * 0.0146);        // ~28px
    const pillSize = Math.round(w * 0.0135);         // ~26px
    const pillPadV = Math.round(h * 0.013);          // ~14px
    const pillPadH = Math.round(w * 0.016);          // ~30px
    const gap = Math.round(w * 0.008);               // ~16px

    const toneStyle = {
      neutral: `
        color:rgba(245,236,224,0.85);
        background:rgba(245,236,224,0.06);
        border:1px solid rgba(245,236,224,0.15);
      `,
      accent: `
        color:#da7756;
        background:rgba(218,119,86,0.10);
        border:1px solid rgba(218,119,86,0.30);
      `,
      muted: `
        color:rgba(245,236,224,0.50);
        background:rgba(245,236,224,0.03);
        border:1px solid rgba(245,236,224,0.08);
      `,
      gold: `
        color:#d4b483;
        background:rgba(212,180,131,0.10);
        border:1px solid rgba(212,180,131,0.25);
      `,
    };

    const tagsHtml = rawTags.map((t) => {
      let text, tone;
      if (typeof t === "string") {
        text = t;
        tone = defaultTone;
      } else {
        text = t.text || "";
        tone = t.tone || defaultTone;
      }
      const style = toneStyle[tone] || toneStyle.neutral;
      return `
        <span style="
          display:inline-flex;
          align-items:center;
          padding:${pillPadV}px ${pillPadH}px;
          border-radius:999px;
          font:500 ${pillSize}px/1.2 system-ui,-apple-system,'PingFang SC',sans-serif;
          ${style}
        ">${escapeHtml(text)}</span>
      `;
    }).join("");

    const titleHtml = title ? `
      <div style="
        color:rgba(245,236,224,0.75);
        font:600 ${titleSize}px/1.3 system-ui,-apple-system,'PingFang SC',sans-serif;
        margin-bottom:${Math.round(h*0.037)}px;
      ">${escapeHtml(title)}</div>
    ` : "";

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${padX}px;
        top:${topY}px;
        width:${w - padX * 2}px;
      ">
        ${titleHtml}
        <div style="
          display:flex;
          flex-wrap:wrap;
          gap:${gap}px;
          align-items:center;
        ">${tagsHtml}</div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    const tags = Array.isArray(params.tags) ? params.tags : [];
    return {
      sceneId: "pillTags",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "title", value: params.title || "" },
        ...tags.map((t, i) => ({
          type: "pill",
          role: `tag-${i}`,
          value: typeof t === "string" ? t : (t.text || ""),
        })),
      ],
      boundingBox: {
        x: Math.round(vp.width * 0.083),
        y: Math.round(vp.height * 0.26),
        w: Math.round(vp.width * 0.834),
        h: Math.round(vp.height * 0.5),
      },
    };
  },

  sample() {
    return {
      title: "Hook 的 9 个事件点",
      tags: [
        { text: "SessionStart", tone: "accent" },
        "UserPromptSubmit",
        { text: "PreToolUse", tone: "accent" },
        "PostToolUse",
        "Notification",
        "Stop",
        "SubagentStop",
        "PreCompact",
        "SessionEnd",
      ],
      defaultTone: "neutral",
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
