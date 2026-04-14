export const meta = {
  id: "kineticHeadline",
  version: 1,
  ratio: "4:3",

  category: "typography",
  label: "Kinetic Headline",
  description: "逐字出现的大标题 + 副标题淡入。每个字母带缩放动画，颜色从起始色相渐变到结束色相。",
  tags: ["text", "headline", "stagger", "reveal", "title"],
  mood: ["energetic", "bold", "impactful"],
  theme: ["tech", "product", "brand"],

  tech: "dom",
  duration_hint: 5,
  loopable: false,
  z_hint: "middle",

  default_theme: "warm-gradient",
  themes: {
    "warm-gradient":  { hueStart: 30,  hueEnd: 320, size: 0.09, stagger: 0.18 },
    "cool-tech":      { hueStart: 180, hueEnd: 240, size: 0.08, stagger: 0.12 },
    "mono-accent":    { hueStart: 270, hueEnd: 270, size: 0.1,  stagger: 0.15 },
    "fire-energy":    { hueStart: 0,   hueEnd: 45,  size: 0.095, stagger: 0.1 },
    "mint-fresh":     { hueStart: 150, hueEnd: 180, size: 0.085, stagger: 0.2 },
  },

  params: {
    text:     { type: "string", default: "NEXTFRAME", required: true, label: "标题文字", semantic: "main headline text, uppercase works best, max 14 chars for 4:3", group: "content" },
    subtitle: { type: "string", default: "AI Video Engine", label: "副标题", semantic: "smaller text below headline, appears after all letters", group: "content" },
    hueStart: { type: "number", default: 30, range: [0, 360], step: 1, label: "起始色相", semantic: "first letter color hue, creates gradient across text", group: "color" },
    hueEnd:   { type: "number", default: 320, range: [0, 360], step: 1, label: "结束色相", semantic: "last letter color hue", group: "color" },
    stagger:  { type: "number", default: 0.18, range: [0.05, 0.5], step: 0.01, label: "逐字延迟", semantic: "seconds between each letter appearing, 0.1=fast 0.3=dramatic", group: "animation" },
    size:     { type: "number", default: 0.09, range: [0.04, 0.2], step: 0.005, label: "字号比例", semantic: "font size relative to viewport width, 0.07=medium 0.11=large", group: "style" },
  },

  ai: {
    when: "展示标题、产品名、关键数字、章节标题。适合 PPT/演示文稿的标题页或章节分隔。",
    how: "叠在背景 scene 上面。文字居中显示。调 hueStart/hueEnd 控制颜色风格。",
    example: { text: "NEXTFRAME", subtitle: "AI Video Engine", hueStart: 30, hueEnd: 320 },
    theme_guide: "warm-gradient=暖色渐变, cool-tech=冷色科技, mono-accent=单色强调, fire-energy=火焰, mint-fresh=薄荷",
    avoid: "文字超过 14 个字符会溢出安全区。中文字符占宽更大，建议不超过 9 个。",
    pairs_with: ["auroraGradient", "lowerThirdVelvet"],
  },
};

export function render(t, params, vp) {
  const { text, subtitle, hueStart, hueEnd, stagger, size } = params;
  const W = vp.width, H = vp.height;
  const fontSize = Math.round(W * size);
  const letters = text.split("");
  const totalLetterDur = letters.length * stagger + 0.4;

  let lettersHtml = "";
  for (let i = 0; i < letters.length; i++) {
    const delay = i * stagger;
    const progress = Math.max(0, Math.min(1, (t - delay) / 0.4));
    const ease = progress * (2 - progress);
    const opacity = ease;
    const scale = 0.3 + ease * 0.7;
    const hue = hueStart + (hueEnd - hueStart) * (i / Math.max(1, letters.length - 1));
    lettersHtml += `<span style="display:inline-block;opacity:${opacity};transform:scale(${scale});color:hsl(${hue},80%,65%);transition:none">${letters[i]}</span>`;
  }

  const subProgress = Math.max(0, Math.min(1, (t - totalLetterDur) / 0.6));
  const subOpacity = subProgress * (2 - subProgress);

  return `<div style="width:${W}px;height:${H}px;background:#0a0a12;display:flex;flex-direction:column;justify-content:center;align-items:center;font-family:Inter,-apple-system,sans-serif;overflow:hidden">
  <div style="font-size:${fontSize}px;font-weight:800;letter-spacing:-0.02em;text-align:center;line-height:1.1;padding:0 ${W * 0.05}px">${lettersHtml}</div>
  <div style="font-size:${Math.round(fontSize * 0.28)}px;color:rgba(255,255,255,0.5);margin-top:${Math.round(H * 0.02)}px;opacity:${subOpacity};letter-spacing:0.15em;text-transform:uppercase">${subtitle}</div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "开始" },
    { t: 1.5, label: "逐字出现中" },
    { t: 4, label: "全部显示" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  const fontSize = vp.width * params.size;
  const estWidth = params.text.length * fontSize * 0.65;
  const safeWidth = vp.width * 0.9;
  if (estWidth > safeWidth) {
    errors.push(`文字"${params.text}"预估宽度 ${Math.round(estWidth)}px 超出安全区 ${Math.round(safeWidth)}px。Fix: 减少字数或减小 size 到 ${(safeWidth / (params.text.length * 0.65) / vp.width).toFixed(3)}`);
  }
  if (!params.text || params.text.trim().length === 0) {
    errors.push("text 不能为空。Fix: 传入标题文字");
  }
  return { ok: errors.length === 0, errors };
}
