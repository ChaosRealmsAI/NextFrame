// scenes/9x16/neo-tokyo/content-hookTitle.js

export default {
  id: "hookTitle",
  name: "冲击感 Hook 标题",
  version: "1.0.0",
  ratio: "9:16",
  theme: "neo-tokyo",
  role: "content",
  description: "首帧大字 pop 入场 + 色散 glitch 闪烁 + mono 副标 stagger + 顶部 cyan 能量条",
  duration_hint: 3.0,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `
    Hook 三秒法则的主力（§7.1）— 短视频第 0s 必须最强视觉冲击。做法融合 pop + glitch
    两个 verb（不是 fade）首 0.28s 大字 scale 从 0.72 过冲到 1.08 再落到 1.0（弹性曲线）
    配 3 帧色散 glitch（红/青通道错位 2px）强化赛博故障美学。mono 副标志（"// AI REPLACES HUMAN"
    类命令注释风）在 0.45s 从 translateY 40 stagger 进场。顶部 cyan 能量条从中心向两侧
    clipReveal 擦开 像终端启动 LED。大字用 JetBrains Mono 700 180px 震撼手机屏（§7.5 字号
    下限 42px 这里直接 180px）。高光下划线 2px cyan box-shadow 让标题像霓虹管点亮。
    情绪波形位置 Hook 0-3s 启动段。截图传播测试 单帧截图 = 一个炸眼大字 + 冷酷副标
    + 赛博能量条 朋友圈发得出去。
  `,
  when_to_use: [
    "每条短视频的第一个 slide 开场 0-3s",
    "章节切换时重置注意力的 title 帧",
    "反常识金句的前置冲击（'你写的代码 明天会消失吗？'）",
  ],
  when_not_to_use: [
    "正文展开段（用 content-counterStat 或 comparePair）",
    "需要温和氛围（不适合本主题）",
  ],
  limitations: [
    "title 中文 ≤ 8 字 英文 ≤ 14 字符 超过会压到 2 行破坏冲击",
    "subtitle ≤ 36 字符 mono 等宽容易溢出",
    "glitch 只在 0.1-0.4s 闪烁 之后定住",
  ],
  inspired_by: "Fireship 片头 100 Seconds 的大字 + 攻壳机动队开场 HUD + GitHub Copilot 广告",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-gridPulse", "overlay-progressPulse"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "high",
  z_layer: "top",
  mood: ["intense", "tech", "shock"],

  tags: ["hook", "title", "glitch", "pop", "neo-tokyo", "opener"],

  complexity: "medium",
  performance: { cost: "low", notes: "t-driven scale + 2 个 offset 色散 span，单帧 3 DOM 节点" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-15", change: "初版 Hook 大字 pop + glitch + stagger 副标" }],

  params: {
    title: {
      type: "string",
      required: true,
      semantic: "大字主标题 中文 ≤ 8 字 英文 ≤ 14 字符",
    },
    subtitle: {
      type: "string",
      default: "",
      semantic: "mono 副标 命令/注释风格 例 '// WHAT HAPPENS NEXT'",
    },
    accent: {
      type: "color",
      default: "#00e5ff",
      semantic: "主强调电光青 用于下划线和能量条",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const title = String(params.title || "AI REPLACES YOU");
    const subtitle = String(params.subtitle || "// IN 3 YEARS OR LESS");
    const ac = params.accent || "#00e5ff";

    // pop 曲线：0→0.28s scale 0.72→1.08→1.0 弹性
    const popDur = 0.36;
    const p = Math.min(Math.max(t / popDur, 0), 1);
    let scale;
    if (p < 0.6) {
      // 0→0.6 ease-out cubic 到 1.08
      const q = p / 0.6;
      scale = 0.72 + (1.08 - 0.72) * (1 - Math.pow(1 - q, 3));
    } else {
      // 0.6→1 回落到 1.0
      const q = (p - 0.6) / 0.4;
      scale = 1.08 - 0.08 * q;
    }

    // glitch：0.1-0.4s 色散偏移
    const glitchActive = t > 0.1 && t < 0.42;
    const glitchPhase = glitchActive ? Math.sin(t * 60) : 0;
    const glitchX = glitchActive ? glitchPhase * 3 : 0;

    // subtitle stagger 0.45s 起 fadeY
    const subDur = 0.5;
    const sp = Math.min(Math.max((t - 0.45) / subDur, 0), 1);
    const subEased = 1 - Math.pow(1 - sp, 3);

    // 能量条 clipReveal 中心向外 0.15s 起 0.5s 完成
    const barDur = 0.5;
    const bp = Math.min(Math.max((t - 0.15) / barDur, 0), 1);
    const barEased = 1 - Math.pow(1 - bp, 3);
    const barWidth = barEased * 100;

    // 下划线 drawLine 0.32s 起
    const ulDur = 0.45;
    const up = Math.min(Math.max((t - 0.32) / ulDur, 0), 1);
    const ulEased = 1 - Math.pow(1 - up, 3);

    // 呼吸 scale 持续（进场完成后）
    const breatheScale = t > popDur ? 1 + 0.012 * Math.sin((t - popDur) * 1.6) : 1;
    const finalScale = (scale < 1 ? scale : breatheScale * (t > popDur ? 1 : scale));

    const W = vp.width;
    const H = vp.height;

    host.innerHTML = `
      <div style="
        position: absolute;
        left: 50%;
        top: ${H * 0.22}px;
        transform: translateX(-50%) translateX(${(barWidth - 100) / 2}%);
        width: ${W * 0.7 * (barWidth / 100)}px;
        height: 3px;
        background: linear-gradient(to right,
          transparent 0%, ${ac} 20%, ${ac} 80%, transparent 100%);
        box-shadow: 0 0 16px ${ac}, 0 0 32px rgba(0,229,255,0.4);
      "></div>

      <div style="
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%) scale(${finalScale.toFixed(4)});
        text-align: center;
        color: #e6f7ff;
        font: 700 180px/0.95 'JetBrains Mono', 'SF Mono', 'PingFang SC', monospace;
        letter-spacing: -0.02em;
        white-space: nowrap;
      ">
        <span style="
          position: absolute;
          inset: 0;
          color: #ff4d6a;
          opacity: ${glitchActive ? 0.55 : 0};
          transform: translateX(${(-glitchX).toFixed(2)}px);
          mix-blend-mode: screen;
          pointer-events: none;
        ">${escapeHtml(title)}</span>
        <span style="
          position: absolute;
          inset: 0;
          color: ${ac};
          opacity: ${glitchActive ? 0.55 : 0};
          transform: translateX(${glitchX.toFixed(2)}px);
          mix-blend-mode: screen;
          pointer-events: none;
        ">${escapeHtml(title)}</span>
        <span style="position: relative;">${escapeHtml(title)}</span>
      </div>

      <div style="
        position: absolute;
        left: 50%;
        top: ${H * 0.5 + 130}px;
        transform: translateX(-50%) scaleX(${ulEased.toFixed(3)});
        transform-origin: center;
        width: ${Math.min(W * 0.6, 640)}px;
        height: 2px;
        background: ${ac};
        box-shadow: 0 0 10px ${ac};
      "></div>

      <div style="
        position: absolute;
        left: 0; right: 0;
        top: ${H * 0.62}px;
        text-align: center;
        font: 600 44px/1.4 'JetBrains Mono', 'SF Mono', monospace;
        color: ${ac};
        letter-spacing: 0.12em;
        opacity: ${(subEased * 0.9).toFixed(3)};
        transform: translateY(${(20 * (1 - subEased)).toFixed(2)}px);
      ">${escapeHtml(subtitle)}</div>
    `;
  },

  describe(t, params, vp) {
    const popDur = 0.36;
    const p = Math.min(Math.max(t / popDur, 0), 1);
    return {
      sceneId: "hookTitle",
      phase: t < popDur ? "pop" : t < 0.95 ? "glitch-settle" : "show",
      progress: Math.min(t / 1.0, 1),
      visible: true,
      params,
      elements: [
        { type: "bar", role: "energy-bar", progress: p },
        { type: "title", role: "headline", value: params.title || "AI REPLACES YOU", font: "mono-180" },
        { type: "subtitle", role: "caption", value: params.subtitle || "", font: "mono-44" },
      ],
      boundingBox: { x: 0, y: vp.height * 0.2, w: vp.width, h: vp.height * 0.5 },
    };
  },

  sample() {
    return {
      title: "你会被替代",
      subtitle: "// WHAT AI TAKES FROM YOU NEXT",
      accent: "#00e5ff",
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
