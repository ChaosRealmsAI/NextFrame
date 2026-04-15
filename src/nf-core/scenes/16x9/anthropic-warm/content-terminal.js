// scenes/16x9/anthropic-warm/content-terminal.js
//
// 终端窗口 - macOS 风格终端：红绿灯标题栏 + prompt + 输出行，承载 Session demo

export default {
  // ===== Identity =====
  id: "terminal",
  name: "终端窗口",
  version: "1.0.0",

  // ===== Belonging =====
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",

  // ===== Semantics =====
  description: "macOS 风格终端窗口，含红绿灯 + 目录标题 + prompt 行 + 多条输出行（ok/hi/dim/err 色 token）",
  duration_hint: 8,

  // ===== Render type =====
  type: "dom",
  frame_pure: true,
  assets: [],

  // ===== AI understanding =====
  intent: `
    E01 第四幕 S1/S2/S3 三个 Session 全部靠终端画面驱动。
    §51 "你刚装好 Claude Code，打开终端" / §61 "cd 到项目，说编译报错了" /
    §75 "模型想执行 rm -rf" / §82 "你等不及插了一句"……
    没有终端组件 = 没有"发生在哪里"的视觉锚点。
    设计 (参考 style/landscape-atoms/terminal.html 横屏标杆)：
    - 窗口边：1px rgba(245,236,224,.08) + 16px 圆角，不画投影（和暖底和谐）
    - 标题栏：#1a1a1a 深灰 + 红黄绿三圆点（经典 macOS） + 居中 mono 小灰字显示 cwd
    - 正文区：#111111 纯黑底，mono 21px，prompt 符号 $ 用 green #7ec699 强调
    - 输出行前缀 >>> 用 ink-35（灰淡），让"用户输入"和"系统输出"一眼分开
    - 行内色 token：
        out-hi (橙 ac #da7756 bold) = 动词 / 关键操作名（"读取" "分析" "写入"）
        out-num (gold #d4b483) = 数字 / 量词
        out-ok (green + bold) = 成功
        out-err (red #e06c75 bold) = 错误 / 拦截
        out-dim (ink-30) = 省略号 / 次要
    - 帧纯输出，不打字机动画（动画由 timeline enter/exit 统一控），保证任意 t 截图稳定
    rows 用简单的 token 数组：{prefix, text, tone}，让脚本作者抄起来就用。
  `,

  when_to_use: [
    "所有 Session demo slide（E01 Slide 21-32）",
    "需要展示命令输入 + 结果输出的技术演示",
    "/commit /review-pr 等 slash command 的触发截图",
    "Hook 拦截 rm -rf 等『危险操作被拦』的演示",
  ],

  when_not_to_use: [
    "需要展示源码本体（用 content-codeBlock，有语法高亮）",
    "只展示一个命令没有输出（文字即可）",
    "需要动画打字机效果——走 timeline 动画层，不是这个组件",
  ],

  limitations: [
    "最多 10 条输出行，超过会裁到 10",
    "每行 ≤ 60 字符，超长会换行但不影响帧纯",
    "不做 ANSI 颜色解析——用 tone 字段显式指定",
  ],

  inspired_by: "style/landscape-atoms/terminal.html + macOS Terminal.app + Claude Code 真实终端",
  used_in: [
    "claude-code-源码讲解 E01 Slide 21-23（Session 1 三条消息）",
    "claude-code-源码讲解 E01 Slide 24-27（Session 2 改 bug）",
    "claude-code-源码讲解 E01 Slide 28-32（Session 3 深度协作）",
  ],

  requires: [],
  pairs_well_with: ["bg-warmGradient", "chrome-titleBar", "content-statNumber", "content-injectPath"],
  conflicts_with: ["content-codeBlock（两个黑底窗口并存会很重）"],
  alternatives: ["content-codeBlock（如果是展示代码文件）"],

  visual_weight: "high",
  z_layer: "content",
  mood: ["technical", "demo", "realistic"],

  tags: ["terminal", "shell", "cli", "demo", "session", "macos"],

  complexity: "moderate",
  performance: { cost: "low", notes: "static DOM, each row one flex line" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — macOS-style terminal with prompt + tokenized output rows" },
  ],

  // ===== Params =====
  params: {
    cwd: {
      type: "string",
      default: "~/project",
      semantic: "工作目录，显示在标题栏中间 + prompt 行蓝色段",
    },
    command: {
      type: "string",
      required: true,
      semantic: "用户输入的命令，显示在 $ 后面，如 claude '帮我看看编译报错'",
    },
    rows: {
      type: "array",
      default: [],
      semantic: "输出行数组，每项 { text, tone? } 或 { segments: [{v, tone}] }。tone: hi|num|ok|err|dim|text",
    },
    showCursor: {
      type: "boolean",
      default: true,
      semantic: "是否在最后再显示一个等待输入的 prompt + 光标（不闪烁，保持帧纯）",
    },
  },

  enter: null,
  exit: null,

  // ===== 3 functions =====
  render(host, _t, params, vp) {
    const w = vp.width;
    const h = vp.height;
    const cwd = escapeHtml(params.cwd || "~/project");
    const command = escapeHtml(params.command || "");
    const rows = (Array.isArray(params.rows) ? params.rows : []).slice(0, 10);
    const showCursor = params.showCursor !== false;

    const termW = Math.round(w * 0.73);              // ~1400px
    const termLeft = Math.round((w - termW) / 2);
    const termTop = Math.round(h * 0.18);

    const bodySize = Math.round(w * 0.011);          // ~21px mono
    const outSize = Math.round(w * 0.0104);          // ~20px mono
    const barTitleSize = Math.round(w * 0.0073);     // ~14px

    const toneColor = {
      hi: "color:#da7756;font-weight:700;",
      num: "color:#d4b483;",
      ok: "color:#7ec699;font-weight:700;",
      err: "color:#e06c75;font-weight:700;",
      dim: "color:rgba(245,236,224,0.35);",
      text: "color:rgba(245,236,224,0.75);",
    };

    const rowsHtml = rows.map((r) => {
      // Two shapes: { text, tone } OR { segments: [{v, tone}] }
      let inner;
      if (Array.isArray(r.segments)) {
        inner = r.segments.map((seg) => {
          const style = toneColor[seg.tone] || toneColor.text;
          return `<span style="${style}">${escapeHtml(seg.v || "")}</span>`;
        }).join("");
      } else {
        const style = toneColor[r.tone] || toneColor.text;
        inner = `<span style="${style}">${escapeHtml(r.text || "")}</span>`;
      }
      return `
        <div style="
          display:flex;
          align-items:flex-start;
          gap:0;
          margin-bottom:2px;
          font:400 ${outSize}px/1.65 'SF Mono','JetBrains Mono','Fira Code',Consolas,monospace;
        ">
          <span style="
            color:rgba(245,236,224,0.35);
            font-size:${Math.round(outSize*0.9)}px;
            margin-right:14px;
            margin-top:2px;
            flex-shrink:0;
          ">&gt;&gt;&gt;</span>
          <span>${inner}</span>
        </div>
      `;
    }).join("");

    const cursorHtml = showCursor ? `
      <div style="
        display:flex;
        align-items:center;
        margin-top:8px;
        font:400 ${bodySize}px/1.75 'SF Mono','JetBrains Mono','Fira Code',Consolas,monospace;
      ">
        <span style="color:#7ec699;font-weight:700;margin-right:12px;">$</span>
        <span style="color:#8ab4cc;margin-right:10px;">${cwd}</span>
        <span style="
          display:inline-block;
          width:10px;
          height:${Math.round(bodySize*1.1)}px;
          background:#da7756;
          vertical-align:text-bottom;
        "></span>
      </div>
    ` : "";

    host.innerHTML = `
      <div style="
        position:absolute;
        left:${termLeft}px;
        top:${termTop}px;
        width:${termW}px;
        background:#111111;
        border:1px solid rgba(245,236,224,0.08);
        border-radius:16px;
        overflow:hidden;
      ">
        <div style="
          background:#1a1a1a;
          border-bottom:1px solid rgba(245,236,224,0.06);
          padding:12px 18px;
          display:flex;
          align-items:center;
          gap:8px;
        ">
          <span style="width:12px;height:12px;border-radius:50%;background:#ff5f57;display:inline-block;"></span>
          <span style="width:12px;height:12px;border-radius:50%;background:#febc2e;display:inline-block;"></span>
          <span style="width:12px;height:12px;border-radius:50%;background:#28c840;display:inline-block;"></span>
          <span style="
            flex:1;
            text-align:center;
            font:400 ${barTitleSize}px/1 'SF Mono','JetBrains Mono','Fira Code',Consolas,monospace;
            color:rgba(245,236,224,0.35);
          ">${cwd} — bash</span>
        </div>
        <div style="
          padding:${Math.round(h*0.028)}px ${Math.round(w*0.019)}px;
          color:#f5ece0;
        ">
          <div style="
            display:flex;
            align-items:center;
            margin-bottom:${Math.round(h*0.011)}px;
            font:400 ${bodySize}px/1.75 'SF Mono','JetBrains Mono','Fira Code',Consolas,monospace;
          ">
            <span style="color:#7ec699;font-weight:700;margin-right:12px;">$</span>
            <span style="color:#8ab4cc;margin-right:10px;">${cwd}</span>
            <span style="color:#f5ece0;">${command}</span>
          </div>
          ${rowsHtml}
          ${cursorHtml}
        </div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    const rows = Array.isArray(params.rows) ? params.rows : [];
    return {
      sceneId: "terminal",
      phase: "hold",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "cwd", value: params.cwd || "~/project" },
        { type: "text", role: "command", value: params.command || "" },
        ...rows.map((r, i) => ({
          type: "output",
          role: `row-${i}`,
          value: r.text || (Array.isArray(r.segments) ? r.segments.map((s) => s.v).join("") : ""),
        })),
      ],
      boundingBox: {
        x: Math.round((vp.width - vp.width * 0.73) / 2),
        y: Math.round(vp.height * 0.18),
        w: Math.round(vp.width * 0.73),
        h: Math.round(vp.height * 0.62),
      },
    };
  },

  sample() {
    return {
      cwd: "~/my-rust-project",
      command: "claude '编译报错了，帮我看看'",
      rows: [
        { segments: [
          { v: "读取 ", tone: "hi" },
          { v: "CLAUDE.md 九层合并（项目+用户）", tone: "text" },
          { v: " ...", tone: "dim" },
        ]},
        { segments: [
          { v: "cargo check ", tone: "hi" },
          { v: "→ 找到 ", tone: "text" },
          { v: "3 处", tone: "num" },
          { v: " E0382 错误", tone: "text" },
        ]},
        { segments: [
          { v: "读取 src/main.rs ", tone: "hi" },
          { v: "（文件 3000 行，只返回前 2000 行）", tone: "dim" },
        ]},
        { segments: [
          { v: "修改完成 ✓  ", tone: "ok" },
          { v: "5 轮调用，包裹 2.5 万→4 万字", tone: "num" },
        ]},
      ],
      showCursor: true,
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
