// scenes/16x9/newsprint-mono/content-newsCover.js
// 报纸封面：masthead + 大 serif 标题 + 红色 VOL 标签 + byline
export default {
  id: "newsCover",
  name: "News Cover",
  version: "1.0.0",
  ratio: "16:9",
  theme: "newsprint-mono",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "报纸头版：报头（刊名+日期）+ serif 大标题 + 红色 VOL 标签 + byline + 细线分割",
  duration_hint: 15,
  intent: "报纸头版开篇。米白纸底 + 黑色 serif 主标题 + 经济学人红作点睛（VOL · ISSUE 标签）+ 细分割线，整体克制严肃。标题逐字（词）显露模拟印刷上墨的节奏；分割线从中向两端推开；红色 VOL 标签从左滑入最后落笔。",
  when_to_use: ["技术讲解开篇", "严肃内容封面"],
  when_not_to_use: ["移动端短视频", "娱乐 vlog"],
  limitations: ["标题不超过 24 字", "刊名不超过 24 字"],
  inspired_by: "经济学人封面 + NYT Magazine 版式",
  used_in: [],
  requires: [],
  pairs_well_with: ["newsPullQuote"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["serious", "editorial", "dense"],
  tags: ["cover", "masthead", "headline", "newsprint-mono"],
  complexity: "medium",
  performance: { cost: "low", notes: "纯 text + 静态线条 + svg noise 一次" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-16", change: "initial — smoke newsprint cover" },
  ],
  params: {
    masthead: { type: "string", default: "THE NEXTFRAME TIMES", semantic: "刊名（报头）" },
    date: { type: "string", default: "APR · 16 · 2026", semantic: "发行日期" },
    volume: { type: "string", default: "VOL · 01", semantic: "期号（红色强调）" },
    headline: { type: "string", default: "When JSON Becomes Motion", semantic: "主标题" },
    sub: { type: "string", default: "A quiet revolution in programmable video.", semantic: "副标题 / deck" },
    byline: { type: "string", default: "By Zhuanz · NextFrame Labs", semantic: "作者线" },
  },
  enter: null,
  exit: null,

  render(t, params, _vp) {
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const clamp = (a, b, x) => Math.max(a, Math.min(b, x));
    const entry = (d = 0, dur = 0.4) => eo(Math.max(0, (t - d) / dur));
    const op = (d, dur = 0.4) => clamp(0, 1, entry(d, dur));
    const ty = (d, dur = 0.4, amp = 10) => amp * (1 - entry(d, dur));
    const sx = (d, dur = 0.6) => entry(d, dur);

    const masthead = params.masthead || "THE NEXTFRAME TIMES";
    const date = params.date || "APR · 16 · 2026";
    const volume = params.volume || "VOL · 01";
    const headline = params.headline || "When JSON Becomes Motion";
    const sub = params.sub || "A quiet revolution in programmable video.";
    const byline = params.byline || "By Zhuanz · NextFrame Labs";

    const serif = `'Charter','Noto Serif SC',Georgia,'Songti SC',serif`;
    const mono = `'JetBrains Mono','SF Mono',Menlo,monospace`;

    const grain = `<svg style="position:absolute;inset:0;width:100%;height:100%;opacity:0.08;mix-blend-mode:multiply;pointer-events:none;" xmlns="http://www.w3.org/2000/svg"><filter id="nmNoise"><feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="11"/><feColorMatrix values="0 0 0 0 0.07  0 0 0 0 0.07  0 0 0 0 0.07  0 0 0 0.6 0"/></filter><rect width="100%" height="100%" filter="url(#nmNoise)"/></svg>`;

    const opMast = op(0.3, 0.6);
    const rulePct = sx(0.8, 0.9);
    const opVol = op(1.6, 0.5);
    const volX = -40 * (1 - entry(1.6, 0.5));
    const opH = op(2.4, 0.8);
    const opSub = op(3.2, 0.6);
    const opBy = op(4.0, 0.6);
    const ruleBotPct = sx(5.0, 1.0);

    return `
      <div style="position:absolute;inset:0;background:#fafaf7;overflow:hidden;font-feature-settings:'liga','onum';">
        ${grain}

        <!-- masthead row: 刊名 居中 -->
        <div style="position:absolute;left:120px;right:120px;top:60px;height:60px;
          display:flex;align-items:center;justify-content:space-between;
          opacity:${opMast};font-family:${mono};font-size:16px;letter-spacing:0.22em;color:#6e6e6e;text-transform:uppercase;">
          <span>${date}</span>
          <span style="font-family:${serif};font-size:30px;letter-spacing:0.08em;color:#111;font-weight:700;text-transform:uppercase;">${masthead}</span>
          <span>No. ${params.volume ? params.volume.replace(/\D/g, "").padStart(2,"0") : "01"}</span>
        </div>

        <!-- top rule: 从中间向两侧推开 -->
        <div style="position:absolute;left:50%;top:132px;height:2px;background:#111;
          width:${(1920 - 240) * rulePct}px;transform:translateX(-50%);transform-origin:center;"></div>

        <!-- red VOL stamp (slide in from left) -->
        <div style="position:absolute;left:${120 + volX}px;top:170px;opacity:${opVol};
          font-family:${mono};font-size:18px;letter-spacing:0.3em;color:#c0392b;font-weight:700;text-transform:uppercase;
          padding:6px 12px;border:2px solid #c0392b;">${volume}</div>

        <!-- headline: 居中大字 -->
        <div style="position:absolute;left:120px;right:120px;top:260px;text-align:center;opacity:${opH};transform:translateY(${ty(2.4, 0.8, 14)}px);">
          <div style="font-family:${serif};font-size:96px;line-height:1.1;font-weight:700;color:#111;letter-spacing:-0.01em;">${headline}</div>
        </div>

        <!-- deck / sub (italic, centered) -->
        <div style="position:absolute;left:220px;right:220px;top:540px;text-align:center;opacity:${opSub};transform:translateY(${ty(3.2, 0.6, 8)}px);">
          <div style="font-family:${serif};font-size:36px;line-height:1.3;font-style:italic;color:#6e6e6e;">${sub}</div>
        </div>

        <!-- byline -->
        <div style="position:absolute;left:0;right:0;top:680px;text-align:center;opacity:${opBy};">
          <div style="font-family:${mono};font-size:18px;letter-spacing:0.25em;color:#6e6e6e;text-transform:uppercase;">${byline}</div>
        </div>

        <!-- bottom rule: 从中间向两侧推开 -->
        <div style="position:absolute;left:50%;bottom:140px;height:1px;background:rgba(17,17,17,0.12);
          width:${(1920 - 240) * ruleBotPct}px;transform:translateX(-50%);"></div>

        <!-- footer strip -->
        <div style="position:absolute;left:120px;right:120px;bottom:80px;height:40px;
          display:flex;align-items:center;justify-content:space-between;opacity:${opBy};
          font-family:${mono};font-size:14px;letter-spacing:0.3em;color:#6e6e6e;text-transform:uppercase;">
          <span>NEXTFRAME.DEV</span>
          <span>PAGE · 01</span>
          <span>SECTION A</span>
        </div>
      </div>`;
  },

  describe(t, params, vp) {
    const phase = t < 0.3 ? "pre" : t < 4.0 ? "enter" : t < 13 ? "show" : "exit";
    return {
      sceneId: "newsCover", phase,
      progress: Math.min(1, t / 15), visible: true, params,
      elements: [
        { type: "masthead", role: "chrome", value: params.masthead || "" },
        { type: "headline", role: "main", value: params.headline || "" },
        { type: "subtitle", role: "deck", value: params.sub || "" },
        { type: "stamp", role: "accent", value: params.volume || "" },
        { type: "byline", role: "metadata", value: params.byline || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      masthead: "THE NEXTFRAME TIMES",
      date: "APR · 16 · 2026",
      volume: "VOL · 01",
      headline: "When JSON Becomes Motion",
      sub: "A quiet revolution in programmable video.",
      byline: "By Zhuanz · NextFrame Labs",
    };
  },
};
