export const meta = {
  id: "demoCompareCards",
  version: 1,
  ratio: "16:9",
  category: "overlays",
  label: "Demo Compare Cards",
  description: "两张对比卡片并排，带标题、特性列表和颜色强调。展示 DOM 布局能力。",
  tech: "dom",
  duration_hint: 7,
  loopable: false,
  z_hint: "middle",
  tags: ["comparison", "cards", "dom", "layout", "demo"],
  mood: ["professional", "informative"],
  theme: ["tech", "minimal", "dark"],
  default_theme: "teal-amber",
  themes: {
    "teal-amber": { cardBg: "rgba(13,20,40,0.92)", borderA: "#4fc3f7", borderB: "#ffb74d", textColor: "#e8eaf6", titleColor: "#ffffff", accentA: "#4fc3f7", accentB: "#ffb74d" },
    "green-red":  { cardBg: "rgba(10,18,12,0.92)", borderA: "#69f0ae", borderB: "#ef5350", textColor: "#e8f5e9", titleColor: "#ffffff", accentA: "#69f0ae", accentB: "#ef5350" },
    "purple-gold":{ cardBg: "rgba(18,10,30,0.92)", borderA: "#ce93d8", borderB: "#ffd54f", textColor: "#f3e5f5", titleColor: "#ffffff", accentA: "#ce93d8", accentB: "#ffd54f" },
  },
  params: {
    cardBg:     { type: "string", default: "rgba(13,20,40,0.92)", label: "卡片背景", semantic: "card background color with alpha", group: "color" },
    borderA:    { type: "string", default: "#4fc3f7", label: "左卡边框", semantic: "left card border and accent color", group: "color" },
    borderB:    { type: "string", default: "#ffb74d", label: "右卡边框", semantic: "right card border and accent color", group: "color" },
    textColor:  { type: "string", default: "#e8eaf6", label: "正文颜色", semantic: "body text color for feature items", group: "color" },
    titleColor: { type: "string", default: "#ffffff", label: "标题颜色", semantic: "card title text color", group: "color" },
    accentA:    { type: "string", default: "#4fc3f7", label: "左强调色", semantic: "left card bullet and highlight color", group: "color" },
    accentB:    { type: "string", default: "#ffb74d", label: "右强调色", semantic: "right card bullet and highlight color", group: "color" },
    titleA:     { type: "string", default: "主 Agent", label: "左卡标题", semantic: "left card title text", group: "content" },
    titleB:     { type: "string", default: "子 Agent", label: "右卡标题", semantic: "right card title text", group: "content" },
    sectionTitle: { type: "string", default: "信息卡片", label: "大标题", semantic: "section heading above the cards", group: "content" },
  },
  ai: {
    when: "需要并排对比两个概念时使用，适合教学、产品对比场景",
    how: "叠加在深色背景上，start=14 dur=7s，展示 DOM 布局",
    example: { cardBg: "rgba(13,20,40,0.92)", borderA: "#4fc3f7", borderB: "#ffb74d", textColor: "#e8eaf6", titleColor: "#ffffff", accentA: "#4fc3f7", accentB: "#ffb74d", titleA: "主 Agent", titleB: "子 Agent", sectionTitle: "信息卡片" },
    theme_guide: { "teal-amber": "蓝橙对比", "green-red": "绿红对比", "purple-gold": "紫金对比" },
    avoid: "内容过多时不要用，每张卡不超过5个特性",
    pairs_with: ["demoBg", "demoProgress"],
  },
};

function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

export function render(t, params, vp) {
  const { cardBg, borderA, borderB, textColor, titleColor, accentA, accentB, titleA, titleB, sectionTitle } = params;
  const W = vp.width, H = vp.height;

  const fadeIn = ease3(Math.min(1, t / 1.2));
  const slideA = ease3(Math.min(1, t / 1.5));
  const slideB = ease3(Math.min(1, Math.max(0, (t - 0.3) / 1.5)));

  const fs = Math.round(W * 0.018);
  const fsBig = Math.round(W * 0.028);
  const fsTitle = Math.round(W * 0.032);
  const pad = Math.round(W * 0.024);
  const cardW = Math.round(W * 0.35);
  const cardH = Math.round(H * 0.65);
  const cardTop = Math.round(H * 0.2);
  const gapCenter = Math.round(W * 0.05);
  const cardALeft = Math.round(W / 2 - cardW - gapCenter / 2);
  const cardBLeft = Math.round(W / 2 + gapCenter / 2);

  const featuresA = ["规划总体任务", "分发子任务", "汇总结果", "处理异常", "维护状态"];
  const featuresB = ["执行单一任务", "专注一个能力", "独立可测试", "并行运行", "无状态设计"];

  const renderFeatures = (features, accent, startDelay) => features.map((f, i) => {
    const op = ease3(Math.min(1, Math.max(0, (t - startDelay - i * 0.12) / 0.5)));
    return `<div style="display:flex;align-items:center;gap:${Math.round(W * 0.008)}px;margin-bottom:${Math.round(H * 0.02)}px;opacity:${op.toFixed(3)}">
      <span style="color:${accent};font-size:${Math.round(W * 0.016)}px">▸</span>
      <span style="color:${textColor};font-size:${fs}px">${f}</span>
    </div>`;
  }).join('');

  const card = (left, title, accent, border, features, slideP, delay) => {
    const tx = (1 - slideP) * -60;
    return `<div style="position:absolute;left:${left}px;top:${cardTop}px;width:${cardW}px;height:${cardH}px;
      background:${cardBg};border:2px solid ${border};border-radius:${Math.round(W * 0.01)}px;
      padding:${pad}px;box-sizing:border-box;
      transform:translateX(${tx.toFixed(1)}px);opacity:${slideP.toFixed(3)};
      box-shadow:0 0 ${Math.round(W * 0.02)}px ${border}33">
      <div style="color:${accent};font-size:${Math.round(W * 0.012)}px;letter-spacing:0.15em;margin-bottom:${Math.round(H * 0.015)}px;font-family:monospace">AGENT TYPE</div>
      <div style="color:${titleColor};font-size:${fsBig}px;font-weight:700;margin-bottom:${Math.round(H * 0.04)}px;font-family:system-ui,sans-serif">${title}</div>
      ${renderFeatures(features, accent, delay)}
    </div>`;
  };

  const sectionFontSize = Math.round(W * 0.036);

  return `<div style="position:absolute;inset:0;width:${W}px;height:${H}px;overflow:hidden">
  <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.08)}px;text-align:center;
    color:${titleColor};font-size:${sectionFontSize}px;font-weight:700;font-family:system-ui,sans-serif;
    opacity:${fadeIn.toFixed(3)}">${sectionTitle}</div>
  <div style="position:absolute;left:0;right:0;top:${Math.round(H * 0.14)}px;text-align:center;
    color:${textColor};font-size:${Math.round(W * 0.015)}px;font-family:system-ui,sans-serif;opacity:${(fadeIn * 0.5).toFixed(3)}">
    DOM 原生布局 — CSS Flexbox，无 JS 排版计算</div>
  ${card(cardALeft, titleA, accentA, borderA, featuresA, slideA, 0.5)}
  ${card(cardBLeft, titleB, accentB, borderB, featuresB, slideB, 0.8)}
</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "入场前" },
    { t: 1, label: "卡片滑入" },
    { t: 5, label: "完整展示" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!params.titleA) errors.push("titleA 不能为空");
  if (!params.titleB) errors.push("titleB 不能为空");
  return { ok: errors.length === 0, errors };
}
