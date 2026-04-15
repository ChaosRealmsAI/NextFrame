// scenes/9x16/neo-tokyo/overlay-progressPulse.js

export default {
  id: "progressPulse",
  name: "底部节拍进度条",
  version: "1.0.0",
  ratio: "9:16",
  theme: "neo-tokyo",
  role: "overlay",
  description: "底部 cyan 进度条 随 t 线性推进 + 顶端光点 pulse + step 编号 mono 角标",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `
    呼吸 + 节拍 的双重功能（§7.2 每帧不静止）。底部 1.5px cyan 细线从左到右线性推进
    根据 params.progress + params.totalDur + t 计算当前位置。线首端光点 6px 圆点
    pulse 周期 1.2s box-shadow 0→14px 让观众潜意识感知"进度在走"。右下角 mono 小字
    "03 / 07" 章节编号 像视频播放器 HUD。左下角一个状态 LED 绿点 pulse 0.8↔1.0
    表示"录制中"像直播条。本组件是全片的 "心跳" — 所有其他组件共享画面时 这条线
    持续推进 给观众节奏锚点。cyan 主色保持主题一致性。verb pulse + progress-draw
    两种。§7.1 Hook 段保持隐藏（progress 0 时不画光点）避免抢大字戏。§7.5 安全区
    避开：本组件占 y=1820..1860 在 13.5% 底部安全区内不会被 TikTok UI 遮挡。
  `,
  when_to_use: [
    "每条短视频全程播放 持续可见",
    "多章节视频的进度指示",
    "需要节奏锚点的核心段",
  ],
  when_not_to_use: [
    "单一 Hook 帧不需要进度",
    "视频 < 5s 用不上",
    "竖屏以外比例（本组件为 9:16 安全区设计）",
  ],
  limitations: [
    "progress 由 timeline 外部传入 本组件不自动计算",
    "step 编号字符 ≤ 8 超出压 24px",
  ],
  inspired_by: "YouTube/Bilibili 播放器 HUD + Fireship 章节条 + OBS 录制状态指示",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-gridPulse", "content-hookTitle", "content-counterStat", "content-comparePair", "text-goldenQuote"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "low",
  z_layer: "top",
  mood: ["focused", "tech"],

  tags: ["overlay", "progress", "hud", "pulse", "neo-tokyo", "bottom"],

  complexity: "simple",
  performance: { cost: "low", notes: "DOM 5 节点 纯 t-driven 样式" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-15", change: "初版 progress + pulse + LED" }],

  params: {
    progress: {
      type: "number",
      default: 0.35,
      semantic: "0..1 进度比例 由 timeline 外部计算传入",
    },
    step: {
      type: "string",
      default: "03 / 07",
      semantic: "章节编号 例 '03 / 07'",
    },
    status: {
      type: "string",
      default: "RECORDING",
      semantic: "左下角状态标签 LED 旁边 mono 小字",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const progress = Math.min(Math.max(Number(params.progress || 0.35), 0), 1);
    const step = String(params.step || "03 / 07");
    const status = String(params.status || "RECORDING");

    // 整体组件首 0.6s fade in
    const fadeP = Math.min(Math.max(t / 0.6, 0), 1);
    const fadeEased = 1 - Math.pow(1 - fadeP, 3);

    // 光点 pulse 周期 1.2s
    const pulsePhase = Math.sin((t / 1.2) * Math.PI * 2);
    const dotGlow = 8 + 10 * (0.5 + 0.5 * pulsePhase);
    const dotOpacity = 0.75 + 0.25 * (0.5 + 0.5 * pulsePhase);

    // LED pulse 周期 1.6s
    const ledPhase = Math.sin((t / 1.6) * Math.PI * 2);
    const ledOpacity = 0.8 + 0.2 * (0.5 + 0.5 * ledPhase);

    // 进度条 fill 推进 从 0 长到 progress * 1 条 0.9s 起
    const barP = Math.min(Math.max((t - 0.3) / 0.9, 0), 1);
    const barEased = 1 - Math.pow(1 - barP, 3);
    const currentProgress = progress * barEased;

    const W = vp.width;
    const H = vp.height;
    const barLeft = 88;
    const barRight = W - 88;
    const barWidth = barRight - barLeft;
    const barY = H - 100;

    host.innerHTML = `
      <div style="
        position: absolute;
        left: ${barLeft}px;
        top: ${barY}px;
        width: ${barWidth}px;
        height: 1.5px;
        background: rgba(0,229,255,0.15);
        opacity: ${fadeEased.toFixed(3)};
      ">
        <div style="
          position: absolute;
          left: 0;
          top: 0;
          width: ${(currentProgress * 100).toFixed(2)}%;
          height: 100%;
          background: linear-gradient(to right, rgba(0,229,255,0.2) 0%, #00e5ff 100%);
          box-shadow: 0 0 8px rgba(0,229,255,0.5);
        "></div>
        <div style="
          position: absolute;
          left: ${(currentProgress * 100).toFixed(2)}%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #00e5ff;
          opacity: ${dotOpacity.toFixed(3)};
          box-shadow: 0 0 ${dotGlow.toFixed(1)}px #00e5ff,
                      0 0 ${(dotGlow * 2).toFixed(1)}px rgba(0,229,255,0.4);
        "></div>
      </div>

      <div style="
        position: absolute;
        left: ${barLeft}px;
        top: ${barY + 28}px;
        display: flex;
        align-items: center;
        gap: 14px;
        opacity: ${fadeEased.toFixed(3)};
      ">
        <div style="
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #4dff91;
          opacity: ${ledOpacity.toFixed(3)};
          box-shadow: 0 0 8px rgba(77,255,145,0.6);
        "></div>
        <div style="
          font: 600 24px/1 'JetBrains Mono', 'SF Mono', monospace;
          color: rgba(230,247,255,0.75);
          letter-spacing: 0.18em;
        ">● ${escapeHtml(status)}</div>
      </div>

      <div style="
        position: absolute;
        right: ${88}px;
        top: ${barY + 28}px;
        font: 600 26px/1 'JetBrains Mono', 'SF Mono', monospace;
        color: #00e5ff;
        letter-spacing: 0.16em;
        opacity: ${fadeEased.toFixed(3)};
      ">${escapeHtml(step)}</div>
    `;
  },

  describe(t, params, vp) {
    const progress = Math.min(Math.max(Number(params.progress || 0.35), 0), 1);
    return {
      sceneId: "progressPulse",
      phase: "pulse",
      progress: Math.min(t / 0.6, 1),
      visible: true,
      params,
      elements: [
        { type: "bar", role: "progress", value: progress },
        { type: "led", role: "status-light", color: "#4dff91" },
        { type: "label", role: "status", value: params.status || "RECORDING" },
        { type: "step", role: "chapter", value: params.step || "03 / 07" },
      ],
      boundingBox: { x: 88, y: vp.height - 110, w: vp.width - 176, h: 70 },
    };
  },

  sample() {
    return {
      progress: 0.62,
      step: "04 / 07",
      status: "REPLACING",
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
