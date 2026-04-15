// scenes/9x16/sv-interview/chrome-brandFooter.js

export default {
  id: "brandFooter",
  name: "底部品牌栏",
  version: "1.0.0",
  ratio: "9:16",
  theme: "sv-interview",
  role: "chrome",
  description: "底部品牌带 显示合集名 + 数字员工署名",
  duration_hint: null,
  type: "dom",
  frame_pure: true,
  assets: [],

  intent: `
    所有 sv-interview slide 的固定底栏。合集品牌需要每帧可见 让观众
    即便截图传播也能看到来源。位置 y:1820-1920 高度 100px 用 mono
    字体 + 低透明度 不抢主视觉。分三段 左侧合集名 中间细分隔 右侧署名。
  `,
  when_to_use: ["每个 sv-interview slide 的固定底栏"],
  when_not_to_use: ["需要全屏显示的场景"],
  limitations: ["固定高度 100px 底部", "文字溢出不换行"],
  inspired_by: "YouTube 频道水印 + 微信视频号署名栏",
  used_in: [],

  requires: [],
  pairs_well_with: ["bg-spaceField", "content-videoArea"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "light",
  z_layer: "foreground",
  mood: ["trustworthy", "consistent"],

  tags: ["footer", "brand", "chrome", "watermark"],

  complexity: "simple",
  performance: { cost: "low", notes: "纯 DOM 静态" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-15", change: "初版" }],

  params: {
    series: {
      type: "string",
      default: "硅谷访谈",
      semantic: "合集名",
    },
    signature: {
      type: "string",
      default: "王宇轩 + Alysa",
      semantic: "署名",
    },
  },

  enter: null,
  exit: null,

  render(host, _t, params, _vp) {
    const series = params.series || "硅谷访谈";
    const signature = params.signature || "王宇轩 + Alysa";
    host.innerHTML = `
      <style>
        .sv-footer {
          position: absolute;
          bottom: 0; left: 0; right: 0;
          height: 100px;
          padding: 0 80px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-top: 1px solid rgba(77,166,255,0.08);
          background: rgba(0,0,0,0.2);
          font: 500 22px/1 'SF Mono', 'JetBrains Mono', monospace;
          letter-spacing: 0.05em;
        }
        .sv-series {
          color: rgba(77,166,255,0.7);
        }
        .sv-sig {
          color: rgba(245,249,255,0.4);
        }
      </style>
      <div class="sv-footer">
        <div class="sv-series">${escapeHtml(series)}</div>
        <div class="sv-sig">${escapeHtml(signature)}</div>
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "brandFooter",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "series", value: params.series || "硅谷访谈" },
        { type: "text", role: "signature", value: params.signature || "王宇轩 + Alysa" },
      ],
      boundingBox: {
        x: 0,
        y: (1820 / 1920) * vp.height,
        w: vp.width,
        h: (100 / 1920) * vp.height,
      },
    };
  },

  sample() {
    return { series: "硅谷访谈", signature: "王宇轩 + Alysa" };
  },
};

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
