// scenes/16x9/anthropic-warm/content-codeBlock.js
//
// 代码块 - 等宽代码展示：行号 + 简单 syntax highlight，讲源码时的核心组件

export default {
  // ===== Identity =====
  id: "codeBlock",
  name: "代码块",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "等宽代码展示：行号 + 简单 syntax highlight，讲源码时的核心组件",
  duration_hint: 8,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding (18 fields) =====
  intent: `
    「源码讲解」系列最重要的内容组件。直接展示真实代码片段，配合旁白解读。
    用 DOM 而非 canvas 的理由：中文注释在 canvas 上会显示方框，DOM 原生支持 CJK。
    背景用 #15110c（inset 色，比主背景更深），营造"终端/编辑器"感，不用纯黑避免割裂。
    行号用 rgba(245,236,224,.25) 低对比，不抢眼；代码本体 #f5ece0，关键词高亮：
    keyword=#da7756橙、string=#7ec699绿、comment=rgba(245,236,224,.40)灰。
    只做 keyword/string/comment 三类高亮——够用且不需要引入 prism.js 等外部库。
    可选 highlight_lines 把某行加 rgba(218,119,86,.12) 底色，配合旁白点出关键行。
  `,

  when_to_use: [
    "展示真实源码片段，配旁白逐行解读",
    "对比「理解的代码」和「实际代码」",
    "展示 prompts.ts / claude.ts 等关键文件的片段",
  ],

  when_not_to_use: [
    "代码超过 20 行——屏幕放不下，改拆成多张 slide 或用 2 列对比",
    "伪代码/概念演示——改用 content-keyPoints 更清晰",
    "需要行级动画逐行出现——当前版本无此能力，需自定义",
  ],

  limitations: [
    "highlight 规则仅处理 JS/TS 关键词 + 字符串 + 注释，Python/Rust 等仅字符串和注释有效",
    "每行建议 ≤ 60 字符，超长会横向溢出（无 scroll）",
    "最多约 18-20 行，超过会溢出主内容区",
  ],

  inspired_by: "VS Code Dark+ 主题配色 + Anthropic 暖棕调色盘",
  used_in: ["claude-code-源码讲解 E07 代码演示 slide"],

  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "content-keyPoints"],
  conflicts_with: [],
  alternatives: ["content-keyPoints（纯文字要点）"],

  visual_weight: "high",
  z_layer: "content",
  mood: ["technical", "focused"],

  tags: ["code", "syntax-highlight", "monospace", "source", "technical", "typescript"],

  complexity: "medium",
  performance: { cost: "low", notes: "DOM innerHTML, highlight is pure string regex — no external lib" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — line numbers + keyword/string/comment highlight + highlight_lines" },
  ],

  // ===== Params =====
  params: {
    language: {
      type: "string",
      default: "typescript",
      semantic: "语言标签，仅显示用（不影响高亮逻辑）",
    },
    filename: {
      type: "string",
      default: "",
      semantic: "文件名，显示在代码块顶部，如「prompts.ts」",
    },
    code: {
      type: "string",
      required: true,
      semantic: "代码字符串，换行用 \\n",
    },
    highlight_lines: {
      type: "array",
      default: [],
      semantic: "1-indexed 行号数组，标亮这些行，如 [3, 4, 5]",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const code = params.code || "";
    const filename = params.filename || "";
    const language = params.language || "typescript";
    const highlightLines = Array.isArray(params.highlight_lines) ? params.highlight_lines : [];

    const w = vp.width;
    const h = vp.height;
    const padX = Math.round(w * 0.05);
    const contentTop = 96;
    const topOffset = Math.round(h * 0.037);

    const monoSize = Math.round(w * 0.0125); // ~24px
    const lineH = 1.65;

    const lines = code.split("\n");

    const linesHtml = lines.map((line, i) => {
      const lineNum = i + 1;
      const isHighlighted = highlightLines.includes(lineNum);
      const highlightedCode = syntaxHighlight(line);
      return `
        <div style="
          display:flex;
          background:${isHighlighted ? "rgba(218,119,86,0.12)" : "transparent"};
          border-left:${isHighlighted ? "2px solid #da7756" : "2px solid transparent"};
          padding:0 ${Math.round(w*0.01)}px;
          min-height:${Math.round(monoSize * lineH)}px;
          align-items:center;
        ">
          <span style="
            color:rgba(245,236,224,0.25);
            font:400 ${monoSize}px/${lineH} 'SF Mono','JetBrains Mono','Fira Code',Consolas,monospace;
            min-width:${Math.round(w*0.022)}px;
            text-align:right;
            padding-right:${Math.round(w*0.01)}px;
            user-select:none;
            flex-shrink:0;
          ">${lineNum}</span>
          <span style="
            color:#f5ece0;
            font:400 ${monoSize}px/${lineH} 'SF Mono','JetBrains Mono','Fira Code',Consolas,monospace;
            white-space:pre;
          ">${highlightedCode}</span>
        </div>
      `;
    }).join("");

    const headerHtml = (filename || language) ? `
      <div style="
        display:flex;align-items:center;justify-content:space-between;
        padding:${Math.round(h*0.012)}px ${Math.round(w*0.015)}px;
        border-bottom:1px solid rgba(245,236,224,0.10);
      ">
        <span style="
          color:rgba(245,236,224,0.50);
          font:400 ${Math.round(w*0.0115)}px/1 'SF Mono','JetBrains Mono','Fira Code',Consolas,monospace;
        ">${escapeHtml(filename)}</span>
        <span style="
          color:rgba(245,236,224,0.25);
          font:400 ${Math.round(w*0.0104)}px/1 system-ui,-apple-system,'PingFang SC',sans-serif;
        ">${escapeHtml(language)}</span>
      </div>
    ` : "";

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${padX}px;
        top:${contentTop + topOffset}px;
        width:${w - padX * 2}px;
        background:#15110c;
        border-radius:8px;
        border:1px solid rgba(245,236,224,0.10);
        overflow:hidden;
      ">
        ${headerHtml}
        <div style="
          padding:${Math.round(h*0.018)}px 0;
          overflow:hidden;
        ">
          ${linesHtml}
        </div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    const lines = (params.code || "").split("\n");
    return {
      sceneId: "codeBlock",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "filename", value: params.filename || "" },
        { type: "code", role: "content", value: `${lines.length} lines`, language: params.language },
        { type: "highlight", role: "highlighted-lines", value: (params.highlight_lines || []).join(",") },
      ],
      boundingBox: {
        x: Math.round(vp.width * 0.05),
        y: 136,
        w: Math.round(vp.width * 0.9),
        h: Math.round(vp.height * 0.75),
      },
    };
  },

  sample() {
    return {
      filename: "prompts.ts",
      language: "typescript",
      highlight_lines: [4, 5, 6],
      code: `// Claude Code 提示词拼装核心逻辑
// 每次对话都重新执行一遍
export async function buildSystemPrompt(ctx: Context): Promise<string[]> {
  const slots: string[] = [];
  slots.push(await getFactoryDefaults(ctx));   // 出厂设置
  slots.push(await getUserConfig(ctx));          // 用户配置
  slots.push(await getSessionContext(ctx));      // 会话上下文
  slots.push(await getToolResults(ctx));         // 工具结果
  return slots.filter(Boolean);
}`,
    };
  },
};

// Minimal syntax highlighter — keyword / string / comment only, no external lib
function syntaxHighlight(line) {
  // escape HTML first
  let s = escapeHtml(line);
  // single-line comment
  s = s.replace(/(\/\/.*$)/g, '<span style="color:rgba(245,236,224,0.40)">$1</span>');
  // strings (double / single / backtick) — only if not already inside comment span
  s = s.replace(/(&quot;[^&]*&quot;|&#x27;[^&#]*&#x27;|`[^`]*`)/g,
    '<span style="color:#7ec699">$1</span>');
  // keywords
  const kws = ['const', 'let', 'var', 'function', 'async', 'await', 'return',
    'export', 'import', 'from', 'class', 'interface', 'type', 'extends',
    'implements', 'new', 'if', 'else', 'for', 'while', 'of', 'in',
    'true', 'false', 'null', 'undefined', 'void', 'string', 'number',
    'boolean', 'Promise', 'string\\[\\]'];
  kws.forEach(kw => {
    s = s.replace(new RegExp(`\\b(${kw})\\b`, "g"),
      '<span style="color:#da7756">$1</span>');
  });
  return s;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
