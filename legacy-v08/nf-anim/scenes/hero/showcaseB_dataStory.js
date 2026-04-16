import countUp from "../../behaviors/data/countUp.js";
import pieFill from "../../behaviors/data/pieFill.js";
import popIn from "../../behaviors/entrance/popIn.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";
import fadeIn from "../../behaviors/entrance/fadeIn.js";
// TODO: lift repeating act scaffolding into sharedDataPanels when a 2nd 5-act hero lands

const PAL = { ink: "#1a1614", warm: "#da7756", warmDeep: "#b8593e", cream: "#f5ece0",
  soft: "#fffbeb", pink: "#ff5577", gold: "#ffd166", muted: "#7a6a5e" };

const ACTS = [
  { id: "stat", start: 0.0, end: 2.4 }, { id: "bars", start: 2.4, end: 4.8 },
  { id: "cmp", start: 4.8, end: 7.2 }, { id: "pie", start: 7.2, end: 9.6 },
  { id: "done", start: 9.6, end: 12.0 },
];

const meta = {
  id: "showcaseB_dataStory", ratio: "any", duration_hint: 12, type: "motion", category: "hero",
  description: "Half-Buddha 5-act data story: 97% → bar race → 4h vs 5min → pie → conclusion, stitched by per-act opacity envelopes in anthropic warm",
  params: [
    { name: "headline", type: "string", default: "97", semantic: "hero percentage for act 1" },
    { name: "attribution", type: "string", default: "— NextFrame · AI 视频引擎", semantic: "final-act byline text" },
  ],
  examples: [{ headline: "97", attribution: "— NextFrame · AI 视频引擎" }],
};

// mask disabled — Chrome clips centered text when a mask is applied to a transformed <g>.
// Wipe is now an opacity envelope gate per act: 0 outside [start,end], 1 inside.
// Envelope REPLACES behaviors' opacity tracks (slide/pop still animate via other channels).
const wipe = () => null;
const envelopeFor = (s, e) => [[0, 0], [s - 0.01, 0], [s + 0.4, 1, "outCubic"],
  [e - 0.3, 1], [e, 0, "inCubic"], [12, 0]];
const gate = (layers, s, e) => {
  const op = envelopeFor(s, e);
  return layers.map((L) => L && typeof L === "object"
    ? { ...L, tracks: { ...(L.tracks || {}), opacity: op } } : L);
};

// thin warm line that grows horizontally from a pin-dot
const underline = (cx, y, w, start, color = PAL.warm, mask = null) => ({
  shape: "rect", at: [cx, y], width: 1, height: 2, fill: color, opacity: 0.85, mask,
  tracks: { width: [[start, 1], [start + 0.35, w, "outCubic"]] },
});

// eyebrow = small accent dot + tiny upper label
const eyebrow = (cx, y, text, start, S, mask) => ([
  { shape: "circle", at: [cx - S * 0.16, y], radius: S * 0.012, fill: PAL.warm, mask,
    behaviors: [popIn(start, 0.35, { fromScale: 0, peakScale: 1.4 })] },
  { shape: "text", at: [cx - S * 0.13, y + S * 0.003], text,
    fill: PAL.warm, font: "system-ui, sans-serif", fontSize: S * 0.028, weight: 600,
    letterSpacing: S * 0.004, mask,
    behaviors: [slideInUp(start + 0.05, 0.4, { distance: S * 0.015 })] },
]);

function actStat(W, H, S, cx, params, mask, start) {
  return [
    ...eyebrow(cx, H * 0.22, "AI 视频成本下降", start + 0.1, S, mask),
    { shape: "text", at: [cx, H * 0.52], suffix: "%",
      decimals: 0, fill: PAL.ink,
      font: "system-ui, sans-serif", fontSize: S * 0.38, weight: 800, mask,
      tracks: { fill: [[start, PAL.muted], [start + 1.2, PAL.warmDeep, "out"]] },
      behaviors: [
        countUp(start + 0.25, 1.4, { from: 0, value: Number(params.headline ?? 97) }),
        popIn(start + 0.25, 0.5, { fromScale: 0.82, peakScale: 1.03 }),
      ] },
    underline(cx, H * 0.72, S * 0.22, start + 1.3, PAL.warm, mask),
    { shape: "text", at: [cx, H * 0.82], text: "——— 故事从这里开始", fill: PAL.muted,
      font: "system-ui, sans-serif", fontSize: S * 0.028, weight: 500, mask,
      behaviors: [fadeIn(start + 1.5, 0.5)] },
  ];
}

function actBars(W, H, S, cx, mask, start) {
  const data = [
    { label: "人工", value: 100, color: PAL.muted },
    { label: "传统工具", value: 45, color: PAL.gold },
    { label: "旧款 AI", value: 18, color: PAL.warm },
    { label: "nf-anim", value: 3, color: PAL.pink },
  ];
  const baseY = H * 0.78, top = H * 0.32;
  const maxH = baseY - top;
  const colW = W * 0.16;
  const gap = W * 0.04;
  const totalW = data.length * colW + (data.length - 1) * gap;
  const x0 = cx - totalW / 2 + colW / 2;
  const layers = [
    ...eyebrow(cx, H * 0.18, "单条视频：工时对比（分钟）", start + 0.05, S, mask),
  ];
  data.forEach((d, i) => {
    const h = (d.value / 100) * maxH;
    const x = x0 + i * (colW + gap);
    const s = start + 0.15 + i * 0.08;
    layers.push(
      { shape: "bar", at: [x, baseY - h / 2], width: colW, height: h, radius: 4,
        fill: d.color, mask,
        tracks: { scaleY: [[s, 0.02], [s + 0.75, 1, "outCubic"]] },
        behaviors: [fadeIn(s, 0.3)] },
      { shape: "text", at: [x, baseY - h - S * 0.04], suffix: "分",
        decimals: 0, fill: d.color,
        font: "Inter, system-ui, sans-serif", fontSize: S * 0.036, weight: 800, mask,
        behaviors: [countUp(s + 0.2, 0.6, { from: 0, value: d.value })] },
      { shape: "text", at: [x, baseY + S * 0.05], text: d.label,
        fill: PAL.muted, font: "system-ui, sans-serif", fontSize: S * 0.024, weight: 500, mask,
        behaviors: [fadeIn(s + 0.1, 0.35)] },
    );
  });
  layers.push({ shape: "rect", at: [cx, baseY + 1], width: totalW * 1.1, height: 1.5,
    fill: PAL.warm, opacity: 0.55, mask,
    tracks: { width: [[start + 0.1, 1], [start + 0.7, totalW * 1.1, "outCubic"]] } });
  return layers;
}

function actCompare(W, H, S, cx, mask, start) {
  const leftX = W * 0.28, rightX = W * 0.72;
  return [
    ...eyebrow(cx, H * 0.18, "同一支视频", start + 0.05, S, mask),
    { shape: "text", at: [leftX, H * 0.32], text: "传统流程",
      fill: PAL.muted, font: "system-ui, sans-serif", fontSize: S * 0.030, weight: 600, mask,
      behaviors: [slideInUp(start + 0.15, 0.4, { distance: S * 0.02 })] },
    { shape: "text", at: [leftX, H * 0.54], suffix: " 小时",
      decimals: 0, fill: PAL.muted,
      font: "system-ui, sans-serif", fontSize: S * 0.16, weight: 800, mask,
      behaviors: [countUp(start + 0.25, 0.9, { from: 0, value: 4 }),
        popIn(start + 0.25, 0.45, { fromScale: 0.85, peakScale: 1.02 })] },
    underline(leftX, H * 0.70, S * 0.18, start + 0.5, PAL.muted, mask),
    { shape: "circle", at: [cx, H * 0.5], radius: S * 0.05, fill: PAL.warm, opacity: 0.15, mask,
      behaviors: [popIn(start + 0.6, 0.5, { fromScale: 0, peakScale: 1.2 })] },
    { shape: "text", at: [cx, H * 0.5], text: "VS",
      fill: PAL.warmDeep, font: "system-ui, sans-serif", fontSize: S * 0.052, weight: 900,
      mask,
      behaviors: [popIn(start + 0.7, 0.5, { fromScale: 0, peakScale: 1.2 })] },
    { shape: "text", at: [rightX, H * 0.32], text: "nf-anim",
      fill: PAL.warmDeep, font: "system-ui, sans-serif", fontSize: S * 0.030, weight: 700, mask,
      behaviors: [slideInUp(start + 0.9, 0.4, { distance: S * 0.02 })] },
    { shape: "text", at: [rightX, H * 0.54], suffix: " 分钟",
      decimals: 0, fill: PAL.ink,
      font: "system-ui, sans-serif", fontSize: S * 0.16, weight: 800, mask,
      tracks: { fill: [[start + 1.0, PAL.muted], [start + 1.7, PAL.warmDeep, "out"]] },
      behaviors: [countUp(start + 1.05, 0.9, { from: 0, value: 5 }),
        popIn(start + 1.05, 0.45, { fromScale: 0.85, peakScale: 1.04 })] },
    underline(rightX, H * 0.70, S * 0.22, start + 1.3, PAL.warm, mask),
    { shape: "text", at: [cx, H * 0.86], text: "快 48 倍 · 一条视频一杯咖啡",
      fill: PAL.muted, font: "system-ui, sans-serif", fontSize: S * 0.026, weight: 500, mask,
      behaviors: [fadeIn(start + 1.7, 0.5)] },
  ];
}

function actPie(W, H, S, cx, mask, start) {
  const slices = [
    { label: "渲染", value: 62, color: PAL.warm },
    { label: "脚本", value: 25, color: PAL.gold },
    { label: "发布", value: 13, color: PAL.pink },
  ];
  const total = 100;
  const pieCx = W * 0.33, pieCy = H * 0.58;
  const R = S * 0.22;
  let acc = 0;
  const layers = [
    ...eyebrow(cx, H * 0.18, "节省时间去了哪里", start + 0.05, S, mask),
    { shape: "circle", at: [pieCx, pieCy], radius: R * 1.1, fill: PAL.cream, opacity: 0.9, mask,
      behaviors: [fadeIn(start + 0.1, 0.4)] },
  ];
  slices.forEach((s, i) => {
    const pct = (s.value / total) * 100;
    const bStart = start + 0.25 + i * 0.12;
    layers.push(
      { shape: "pie", at: [pieCx, pieCy], value: pct, radius: R, rotate: acc,
        fill: s.color, mask,
        behaviors: [pieFill(bStart, 0.7, { percent: pct }), popIn(bStart, 0.4)] },
      { shape: "rect", at: [W * 0.60, H * (0.38 + i * 0.14)], width: S * 0.04, height: S * 0.04,
        radius: 3, fill: s.color, mask,
        behaviors: [fadeIn(bStart + 0.15, 0.3)] },
      { shape: "text", at: [W * 0.66, H * (0.38 + i * 0.14)], text: s.label,
        fill: PAL.ink, font: "system-ui, sans-serif", fontSize: S * 0.028, weight: 600, mask,
        behaviors: [slideInUp(bStart + 0.18, 0.4, { distance: S * 0.012 })] },
      { shape: "text", at: [W * 0.84, H * (0.38 + i * 0.14)], suffix: "%",
        decimals: 0, fill: s.color,
        font: "Inter, system-ui, sans-serif", fontSize: S * 0.034, weight: 800, mask,
        behaviors: [countUp(bStart + 0.22, 0.6, { from: 0, value: s.value })] },
    );
    acc += pct * 3.6;
  });
  return layers;
}

function actDone(W, H, S, cx, params, mask, start) {
  return [
    ...eyebrow(cx, H * 0.22, "结论", start + 0.05, S, mask),
    { shape: "text", at: [cx, H * 0.44], text: "让创意",
      fill: PAL.muted, font: "system-ui, sans-serif", fontSize: S * 0.072, weight: 500, mask,
      behaviors: [slideInUp(start + 0.15, 0.5, { distance: S * 0.03 })] },
    { shape: "text", at: [cx, H * 0.60], text: "以帧的速度交付",
      fill: PAL.ink, font: "system-ui, sans-serif", fontSize: S * 0.088, weight: 800, mask,
      tracks: { fill: [[start + 0.3, PAL.muted], [start + 1.1, PAL.warmDeep, "out"]] },
      behaviors: [slideInUp(start + 0.35, 0.6, { distance: S * 0.03 }),
        popIn(start + 0.35, 0.5, { fromScale: 0.9, peakScale: 1.02 })] },
    underline(cx, H * 0.72, S * 0.3, start + 0.9, PAL.warm, mask),
    { shape: "text", at: [cx, H * 0.84], text: params.attribution ?? "— NextFrame · AI 视频引擎",
      fill: PAL.warm, font: "system-ui, sans-serif", fontSize: S * 0.026, weight: 500,
      letterSpacing: S * 0.004, mask,
      behaviors: [fadeIn(start + 1.1, 0.6)] },
  ];
}

function chapterMarkers(W, H, S, cx) {
  const dotY = H * 0.94;
  const gap = S * 0.05;
  return ACTS.map((act, i) => {
    const x = cx + (i - 2) * gap;
    return { shape: "circle", at: [x, dotY], radius: S * 0.008,
      fill: PAL.muted, opacity: 0.35,
      tracks: { fill: [[act.start, PAL.muted], [act.start + 0.2, PAL.warm, "out"]],
        opacity: [[act.start - 0.1, 0.35], [act.start + 0.25, 0.95, "out"],
          [act.end - 0.1, 0.95], [act.end + 0.15, 0.5, "out"]] } };
  });
}

export default {
  ...meta,
  render(host, t, p = {}, vp = { width: 320, height: 240 }) {
    void t;
    const W = vp.width || 320, H = vp.height || 240;
    const S = Math.min(W, H);
    const cx = W * 0.5;
    const layers = [
      // persistent cream wash background
      { shape: "rect", at: [cx, H * 0.5], width: W, height: H,
        fill: { type: "linear", dir: "vertical", stops: [
          { offset: 0, color: PAL.soft }, { offset: 1, color: PAL.cream },
        ] },
        tracks: { opacity: [[0, 0], [0.3, 1, "out"]] } },
      // chapter markers (always visible, recolor per act)
      ...chapterMarkers(W, H, S, cx),
    ];
    const mk = (i) => wipe(W, H, ACTS[i].start, ACTS[i].end);
    const a = (i, built) => gate(built, ACTS[i].start, ACTS[i].end);
    const acts = [
      a(0, actStat(W, H, S, cx, p, mk(0), ACTS[0].start)),
      a(1, actBars(W, H, S, cx, mk(1), ACTS[1].start)),
      a(2, actCompare(W, H, S, cx, mk(2), ACTS[2].start)),
      a(3, actPie(W, H, S, cx, mk(3), ACTS[3].start)),
      a(4, actDone(W, H, S, cx, p, mk(4), ACTS[4].start)),
    ];
    for (const act of acts) layers.push(...act);
    return { duration: 12, size: [W, H], layers };
  },
  describe(t, params = {}) {
    const act = ACTS.find((a) => t < a.end) || ACTS[ACTS.length - 1];
    return { sceneId: meta.id, phase: act.id, actIndex: ACTS.indexOf(act), visible: true, params };
  },
  sample() { return meta.examples[0]; },
};
