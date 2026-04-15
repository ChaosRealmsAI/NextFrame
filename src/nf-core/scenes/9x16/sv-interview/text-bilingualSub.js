// scenes/9x16/sv-interview/text-bilingualSub.js

export default {
  id: "bilingualSub",
  name: "双语字幕",
  version: "1.0.0",
  ratio: "9:16",
  theme: "sv-interview",
  role: "text",
  description: "中英双语字幕 英文主 / 中文副 底部居中",
  duration_hint: null,
  type: "dom",
  frame_pure: true,
  assets: [],

  intent: `
    sv-interview 的核心卖点 让看不懂英文的观众秒懂硅谷大佬说啥。
    英文在上 琥珀金 #f0a030 保留原声权威感 中文在下 米白 #f5f9ff 辅助
    听不懂的人。位置放 y:1380-1740 避开人脸三分线 和 底部品牌带留 180px
    间距。字号 52/40 经过测试 手机端 4-5 米观看距离能清晰阅读。
  `,
  when_to_use: ["访谈片段每段原声的字幕同步显示"],
  when_not_to_use: ["纯中文内容", "弹幕式特效字"],
  limitations: [
    "英文 ≤ 80 字符 中文 ≤ 40 字",
    "不支持 RTL 语言",
    "同时只显示一段 cn",
  ],
  inspired_by: "硅谷访谈 Bilibili 双语字幕标准 + Nat Geo 纪录片字幕",
  used_in: [],

  requires: [],
  pairs_well_with: ["content-videoArea", "chrome-sourceBar"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "heavy",
  z_layer: "foreground",
  mood: ["focused", "informative"],

  tags: ["subtitle", "bilingual", "text", "interview", "双语字幕"],

  complexity: "simple",
  performance: { cost: "low", notes: "两次 fillText 级别" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-15", change: "初版" }],

  params: {
    en: {
      type: "string",
      required: true,
      semantic: "英文字幕",
    },
    cn: {
      type: "string",
      default: "",
      semantic: "中文字幕",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    if (host._rendered && t > 1.0) return;
    host._rendered = true;
    const en = params.en || "";
    const cn = params.cn || "";
    const yBase = (1380 / 1920) * vp.height;
    const w = (940 / 1080) * vp.width;
    const xBase = (70 / 1080) * vp.width;

    host.innerHTML = `
      <style>
        .sv-sub {
          position: absolute;
          left: ${xBase}px;
          top: ${yBase}px;
          width: ${w}px;
          text-align: center;
        }
        .sv-en {
          font: 600 52px/1.35 system-ui, -apple-system, 'PingFang SC', sans-serif;
          color: #f0a030;
          margin-bottom: 28px;
          text-shadow: 0 2px 8px rgba(0,0,0,0.8);
        }
        .sv-cn {
          font: 500 40px/1.4 system-ui, -apple-system, 'PingFang SC', sans-serif;
          color: #f5f9ff;
          text-shadow: 0 2px 8px rgba(0,0,0,0.8);
        }
      </style>
      <div class="sv-sub">
        <div class="sv-en">${escapeHtml(en)}</div>
        ${cn ? `<div class="sv-cn">${escapeHtml(cn)}</div>` : ""}
      </div>
    `;
  },

  describe(_t, params, vp) {
    return {
      sceneId: "bilingualSub",
      phase: "show",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "text", role: "en", value: params.en || "" },
        ...(params.cn ? [{ type: "text", role: "cn", value: params.cn }] : []),
      ],
      boundingBox: {
        x: (70 / 1080) * vp.width,
        y: (1380 / 1920) * vp.height,
        w: (940 / 1080) * vp.width,
        h: (280 / 1920) * vp.height,
      },
    };
  },

  sample() {
    return {
      en: "We're approaching an intelligence explosion.",
      cn: "我们正在接近智能爆炸。",
    };
  },
};

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
