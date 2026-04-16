// scenes/16x9/newsprint-mono/content-newsPullQuote.js
// 报纸 pull quote：大号 serif italic 引用 + 红色装饰双引号 + attribution
export default {
  id: "newsPullQuote",
  name: "News Pull Quote",
  version: "1.0.0",
  ratio: "16:9",
  theme: "newsprint-mono",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "报纸引语版式：巨型红色双引号装饰 + 大 italic serif 引用 + attribution + 细分割线",
  duration_hint: 15,
  intent: "报纸中部 pull-quote。经济学人式大引号（红色 ac 作装饰，不是正文用色）+ 居中大 serif italic 引用 + 右对齐 attribution + 上下细线框制造版块感。文字一行行浮现模拟『阅读节奏』；attribution 最后从右侧滑入落笔。",
  when_to_use: ["中段金句", "论点小结", "核心观点强调"],
  when_not_to_use: ["作为标题", "覆盖代码块"],
  limitations: ["quote 不超过 80 字", "attribution 不超过 30 字"],
  inspired_by: "经济学人 pull-quote + NYT Opinion",
  used_in: [],
  requires: [],
  pairs_well_with: ["newsCover"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["serious", "editorial", "contemplative"],
  tags: ["pullquote", "quote", "newsprint-mono"],
  complexity: "low",
  performance: { cost: "low", notes: "纯 text + 静态 svg noise" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial — smoke newsprint pull quote" },
  ],
  params: {
    eyebrow: { type: "string", default: "EDITOR'S NOTE", semantic: "小标签（mono 全大写）" },
    quote: { type: "string", default: "We did not invent motion; we gave it a language that machines can speak.", semantic: "引语正文" },
    attribution: { type: "string", default: "— NextFrame Manifesto, 2026", semantic: "作者线" },
    footer: { type: "string", default: "CONTINUED ON PAGE 02", semantic: "底部延续标签" },
  },
  enter: null,
  exit: null,

  render(t, params, _vp) {
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const clamp = (a, b, x) => Math.max(a, Math.min(b, x));
    const entry = (d = 0, dur = 0.4) => eo(Math.max(0, (t - d) / dur));
    const op = (d, dur = 0.4) => clamp(0, 1, entry(d, dur));
    const ty = (d, dur = 0.4, amp = 10) => amp * (1 - entry(d, dur));

    const eyebrow = params.eyebrow || "EDITOR'S NOTE";
    const quote = params.quote || "We did not invent motion; we gave it a language that machines can speak.";
    const attribution = params.attribution || "— NextFrame Manifesto, 2026";
    const footer = params.footer || "CONTINUED ON PAGE 02";

    const serif = `'Charter','Noto Serif SC',Georgia,'Songti SC',serif`;
    const mono = `'JetBrains Mono','SF Mono',Menlo,monospace`;

    const grain = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.08;mix-blend-mode:multiply;pointer-events:none;" xmlns="http://www.w3.org/2000/svg"><filter id="nmNoiseQ"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="23"/><feColorMatrix values="0 0 0 0 0.07  0 0 0 0 0.07  0 0 0 0 0.07  0 0 0 0.6 0"/></filter><rect width="100%" height="100%" filter="url(#nmNoiseQ)"/></svg>`;

    const opTopRule = entry(0.3, 0.7);
    const opEyebrow = op(0.8, 0.5);
    const opLQuote = op(1.2, 0.6);
    const lQuoteScale = 0.8 + 0.2 * entry(1.2, 0.6);
    const opQuote = op(2.0, 1.5);
    const quoteTy = ty(2.0, 1.5, 14);
    const opAttr = op(10.5, 0.6);
    const attrX = 30 * (1 - entry(10.5, 0.6));
    const opBotRule = entry(11.5, 0.8);
    const opFooter = op(12.5, 0.6);
    const redBarW = entry(11.8, 0.8) * 120;

    return `
      <div style="position:absolute;inset:0;background:#fafaf7;overflow:hidden;font-feature-settings:'liga','onum';">
        ${grain}

        <!-- top rule -->
        <div style="position:absolute;left:120px;right:120px;top:120px;height:2px;background:#111;
          transform:scaleX(${opTopRule});transform-origin:left;"></div>

        <!-- eyebrow (mono) -->
        <div style="position:absolute;left:120px;top:145px;opacity:${opEyebrow};
          font-family:${mono};font-size:18px;letter-spacing:0.3em;color:#6e6e6e;text-transform:uppercase;">${eyebrow}</div>

        <!-- huge red left quote (decorative) -->
        <div style="position:absolute;left:160px;top:220px;opacity:${opLQuote};transform:scale(${lQuoteScale});transform-origin:top left;
          font-family:${serif};font-size:380px;line-height:0.8;font-weight:700;color:#c0392b;font-style:italic;">“</div>

        <!-- main quote: centered italic serif -->
        <div style="position:absolute;left:220px;right:220px;top:320px;opacity:${opQuote};transform:translateY(${quoteTy}px);">
          <div style="font-family:${serif};font-size:72px;line-height:1.3;font-style:italic;color:#111;text-align:center;font-weight:400;">“${quote}”</div>
        </div>

        <!-- attribution: right aligned, mono small caps -->
        <div style="position:absolute;left:120px;right:120px;top:760px;text-align:right;opacity:${opAttr};transform:translateX(${attrX}px);">
          <div style="font-family:${serif};font-size:28px;color:#6e6e6e;font-style:normal;letter-spacing:0.05em;">${attribution}</div>
        </div>

        <!-- bottom rule -->
        <div style="position:absolute;left:120px;right:120px;bottom:140px;height:1px;background:rgba(17,17,17,0.12);
          transform:scaleX(${opBotRule});transform-origin:right;"></div>

        <!-- small red bar (点睛) -->
        <div style="position:absolute;left:120px;bottom:100px;height:3px;background:#c0392b;width:${redBarW}px;"></div>

        <!-- footer strip -->
        <div style="position:absolute;left:120px;right:120px;bottom:60px;height:32px;
          display:flex;align-items:center;justify-content:space-between;opacity:${opFooter};
          font-family:${mono};font-size:14px;letter-spacing:0.3em;color:#6e6e6e;text-transform:uppercase;">
          <span>${footer}</span>
          <span>NEXTFRAME.DEV</span>
          <span>SECTION B</span>
        </div>
      </div>`;
  },

  describe(t, params, vp) {
    const phase = t < 0.3 ? "pre" : t < 3 ? "enter" : t < 12 ? "show" : "exit";
    return {
      sceneId: "newsPullQuote", phase,
      progress: Math.min(1, t / 15), visible: true, params,
      elements: [
        { type: "eyebrow", role: "metadata", value: params.eyebrow || "" },
        { type: "pullquote", role: "main", value: params.quote || "" },
        { type: "attribution", role: "attribution", value: params.attribution || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      eyebrow: "EDITOR'S NOTE",
      quote: "We did not invent motion; we gave it a language that machines can speak.",
      attribution: "— NextFrame Manifesto, 2026",
      footer: "CONTINUED ON PAGE 02",
    };
  },
};
