// scenes/16x9/anthropic-warm/content-compareCols.js
//
// 对比双栏 - 左蓝右橙两个卡片，每栏 badge+title+bullets，用于 A vs B 对比

export default {
  // ===== Identity =====
  id: "compareCols",
  name: "对比双栏",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "左右两个等宽卡片（蓝/橙双色），每栏 badge + 标题 + 要点列表，强对比叙事",
  duration_hint: 6,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding =====
  intent: `
    E01 里有三处强对比叙事必需这个组件：
    §43-44 主 Agent vs 子 Agent（完整包裹 vs 精简版）
    §62/67 进项目前 vs 后（2 万字 vs 2.5 万字；25k vs 35k）
    §79 压缩前 vs 后（8 万字 vs 4 万字）
    以及 S2/S3 里「新手第一次」vs「深度协作」的整集结构对比。
    设计语言上，两栏用主题里的两个冷暖色分区：
    - 左栏 blue #8ab4cc（信息/中性/参照系 = 主 Agent / 压缩前 / Session 1）
    - 右栏 ac 橙 #da7756（主角/强调/被讲解的对象 = 子 Agent / 压缩后 / Session 3）
    每栏一个 badge 小标签（uppercase，像数据库标签），一个 serif 36px 标题（类比卡同款字体），
    然后是要点列表（无序小圆点，24px sans）。
    要点里允许 <strong>关键词</strong>（染本栏色）+ <em>括号里的二级说明</em>（ink-75 小一号）。
    卡片宽度 640px 两列总宽 1280px 居中——等宽让观众视线水平快速扫描，建立"是对比不是级联"的认知。
  `,

  when_to_use: [
    "主 / 子 Agent 对比（E01 Slide 31）",
    "压缩前 / 后对比（E01 Slide 30）",
    "Session 1 vs Session 3 极端情况对比",
    "任何需要「二元并列」叙事的场景：旧 vs 新 / 直觉 vs 事实 / 用户看到 vs 系统实际",
  ],

  when_not_to_use: [
    "对比项 > 2——用 fourSlots 或多张 slide",
    "两侧不是并列关系而是因果/时序——用 flow-diagram",
    "要点列表每栏 > 6 条——信息过载，拆页",
  ],

  limitations: [
    "固定两栏等宽，不支持 7:3 不等分",
    "每栏 bullets 建议 3-6 条",
    "bullets 每条 ≤ 25 汉字，超长会换行打破两栏对齐美感",
  ],

  inspired_by: "Anthropic doc 的 before/after 对比卡 + Notion 双列视图",
  used_in: [
    "claude-code-源码讲解 E01 Slide 31（主/子 Agent）",
    "claude-code-源码讲解 E01 Slide 30（压缩前后）",
  ],

  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "content-statNumber"],
  conflicts_with: [],
  alternatives: ["content-fourSlots（2×2 四格）", "content-keyPoints（单列列表）"],

  visual_weight: "high",
  z_layer: "content",
  mood: ["analytical", "comparative"],

  tags: ["compare", "diff", "two-column", "vs", "before-after"],

  complexity: "moderate",
  performance: { cost: "low", notes: "pure DOM two-column flex" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — blue/orange two-column compare with badge+title+bullets" },
  ],

  // ===== Params =====
  params: {
    left: {
      type: "object",
      required: true,
      semantic: "{ badge: 'Main Agent', title: '主 Agent', bullets: ['完整 system prompt', ...] }",
    },
    right: {
      type: "object",
      required: true,
      semantic: "{ badge: 'Sub Agent', title: '子 Agent', bullets: [...] }",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const w = vp.width;
    const h = vp.height;
    const left = params.left || { badge: "", title: "", bullets: [] };
    const right = params.right || { badge: "", title: "", bullets: [] };

    const totalW = Math.round(w * 0.667);           // ~1280px
    const gap = Math.round(w * 0.021);              // ~40px
    const colW = Math.round((totalW - gap) / 2);    // ~620px
    const leftX = Math.round((w - totalW) / 2);
    const topY = Math.round(h * 0.17);
    const colH = Math.round(h * 0.66);

    const padV = Math.round(h * 0.037);
    const padH = Math.round(w * 0.019);
    const badgeSize = Math.round(w * 0.0083);       // ~16px
    const titleSize = Math.round(w * 0.0187);       // ~36px serif
    const bulletSize = Math.round(w * 0.0125);      // ~24px
    const emSize = Math.round(w * 0.0104);          // ~20px

    function col(data, color, bgAlpha, borderAlpha) {
      const bullets = Array.isArray(data.bullets) ? data.bullets : [];
      const badge = escapeHtml(data.badge || "");
      const title = escapeHtml(data.title || "");
      const bulletsHtml = bullets.map((b) => {
        const text = renderInline(String(b), color);
        return `
          <li style="
            color:#f5ece0;
            font:500 ${bulletSize}px/1.5 system-ui,-apple-system,'PingFang SC',sans-serif;
            padding-left:20px;
            position:relative;
            list-style:none;
          ">
            <span style="
              position:absolute;left:0;top:11px;
              width:6px;height:6px;border-radius:50%;
              background:rgba(245,236,224,0.60);
              display:inline-block;
            "></span>
            ${text}
          </li>
        `;
      }).join("");

      return `
        <div style="
          width:${colW}px;
          min-height:${colH}px;
          padding:${padV}px ${padH}px;
          background:${colorRgba(color, bgAlpha)};
          border:1px solid ${colorRgba(color, borderAlpha)};
          border-radius:12px;
        ">
          ${badge ? `<div style="
            display:inline-block;
            color:${color};
            font:600 ${badgeSize}px/1 system-ui,-apple-system,'PingFang SC',sans-serif;
            letter-spacing:0.06em;
            text-transform:uppercase;
            padding:4px 14px;
            background:${colorRgba(color, 0.12)};
            border:1px solid ${colorRgba(color, 0.30)};
            border-radius:4px;
            margin-bottom:${Math.round(h*0.02)}px;
          ">${badge}</div>` : ""}
          <div style="
            color:${color};
            font:700 ${titleSize}px/1.3 Georgia,'Hiragino Mincho ProN','Noto Serif SC',serif;
            margin-bottom:${Math.round(h*0.026)}px;
          ">${title}</div>
          <ul style="
            display:flex;
            flex-direction:column;
            gap:${Math.round(h*0.017)}px;
            margin:0;
            padding:0;
          ">${bulletsHtml}</ul>
        </div>
      `;
    }

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${leftX}px;
        top:${topY}px;
        width:${totalW}px;
        display:flex;
        gap:${gap}px;
      ">
        ${col(left, "#8ab4cc", 0.06, 0.18)}
        ${col(right, "#da7756", 0.06, 0.18)}
      </div>
    `;

    // helper to generate rgba for bullet em too (scoped via data attribute)
    // we keep em size via inline CSS above
    void emSize;
  },

  describe(_t, params, vp) {
    const left = params.left || {};
    const right = params.right || {};
    return {
      sceneId: "compareCols",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "column", role: "left", value: left.title || "" },
        { type: "column", role: "right", value: right.title || "" },
      ],
      boundingBox: {
        x: Math.round((vp.width - vp.width * 0.667) / 2),
        y: Math.round(vp.height * 0.17),
        w: Math.round(vp.width * 0.667),
        h: Math.round(vp.height * 0.66),
      },
    };
  },

  sample() {
    return {
      left: {
        badge: "Main Agent",
        title: "主 Agent",
        bullets: [
          "**完整 system prompt** <em>3000+ 字</em>",
          "**全部 20+ 工具**可用",
          "CLAUDE.md 九层全加载",
          "记忆、skills、hooks 全在",
          "可派生子 Agent",
        ],
      },
      right: {
        badge: "Sub Agent",
        title: "子 Agent",
        bullets: [
          "**精简版 prompt** <em>只含任务相关</em>",
          "工具被**白名单限制**",
          "只看到传入的上下文",
          "无 hooks、无 memory",
          "不能再派生子 Agent",
        ],
      },
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

function colorRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Markdown-lite: **word** → strong (column color), <em>x</em> → smaller ink-75
function renderInline(s, color) {
  // extract em first so escapeHtml doesn't eat the tag
  const parts = [];
  const emRe = /<em>([^<]+)<\/em>/g;
  let last = 0, m;
  while ((m = emRe.exec(s)) !== null) {
    parts.push({ t: "text", v: s.slice(last, m.index) });
    parts.push({ t: "em", v: m[1] });
    last = emRe.lastIndex;
  }
  parts.push({ t: "text", v: s.slice(last) });

  return parts.map((p) => {
    if (p.t === "em") {
      return `<em style="font-style:normal;color:rgba(245,236,224,0.60);font-size:0.82em;margin-left:6px;">（${escapeHtml(p.v)}）</em>`;
    }
    const esc = escapeHtml(p.v);
    return esc.replace(/\*\*([^*]+)\*\*/g, (_m, kw) =>
      `<strong style="color:${color};font-weight:700;">${kw}</strong>`
    );
  }).join("");
}
