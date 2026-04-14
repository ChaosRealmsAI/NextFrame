import { TOKENS, GRID, TYPE, esc, scaleW, scaleH, fadeIn, decoLine } from "../../../shared/design.js";

export const meta = {
  id: "interviewMeta",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Meta",
  description: "访谈竖屏元数据区：时间信息 + 主题标签 + 话题标签徽章。位于视频区域下方的信息带。",
  tech: "dom",
  duration_hint: 30,
  loopable: true,
  z_hint: "middle",
  tags: ["overlay", "meta", "interview", "topic", "tags", "9x16"],
  mood: ["informative", "structured"],
  theme: ["interview", "talk", "vertical"],
  default_theme: "interview-dark",
  themes: {
    "interview-dark": {
      gold: TOKENS.interview.gold,
      textDim: TOKENS.interview.textDim,
      tagBg: TOKENS.interview.tagBg,
      tagBorder: TOKENS.interview.tagBorder,
      tagText: TOKENS.interview.tagText,
    },
  },
  params: {
    origRange: { type: "string", default: "00:00 – 08:42", label: "时间范围", semantic: "原片时间段，如 '00:00 – 08:42'", group: "content" },
    topicLabel: { type: "string", default: "正在聊", label: "话题标签前缀", semantic: "话题标识词，金色显示", group: "content" },
    topic: { type: "string", default: "", label: "话题正文", semantic: "当前讨论的主题内容", group: "content" },
    tags: { type: "string", default: "", label: "标签（逗号分隔）", semantic: "最多3个标签，用逗号分隔", group: "content" },
  },
  ai: {
    when: "访谈类竖屏视频，需要显示原片时间范围、当前话题和关键词标签时使用。",
    how: "放在 interviewBg 和视频 layer 之上，通常固定贯穿全程。origRange 填原视频时间戳，topic 填本段主题，tags 填3个以内关键词。",
    example: { origRange: "00:00 – 08:42", topicLabel: "正在聊", topic: "用 AI 做视频到底有多快？", tags: "AI制作,自动化,效率" },
    avoid: "tags 不要超过3个，否则布局会溢出。topic 过长（超过40字）会换行影响美观。",
    pairs_with: ["interviewBg", "interviewHeader", "interviewBiSub", "interviewBrand", "progressBar9x16"],
  },
};

export function render(t, params, vp) {
  const origRange = params.origRange || "00:00 – 08:42";
  const topicLabel = params.topicLabel || "正在聊";
  const topic = params.topic || "";
  const rawTags = params.tags || "";

  const alpha = fadeIn(t, 0, 0.45);
  const opacity = Math.max(0, Math.min(1, alpha));

  // Parse tags (max 3)
  const tagList = rawTags.split(",").map(s => s.trim()).filter(Boolean).slice(0, 3);

  // Scale layout positions
  const timeInfoY = scaleH(vp, GRID.timeInfo);
  const topicZoneY = scaleH(vp, GRID.topic.top);
  const sidePad = scaleW(vp, GRID.sidePad);

  // Typography sizes
  const timeInfoSize = scaleW(vp, TYPE.timeInfo.size);
  const topicLabelSize = scaleW(vp, TYPE.topicLabel.size);
  const topicTextSize = scaleW(vp, TYPE.topicText.size);
  const tagSize = scaleW(vp, TYPE.tag.size);

  // Tag padding / border radius
  const tagPadV = scaleH(vp, 12);
  const tagPadH = scaleW(vp, 24);
  const tagRadius = scaleW(vp, 6);
  const tagBorder = scaleW(vp, 1);
  const tagGap = scaleW(vp, 16);
  const topicLabelGap = scaleW(vp, 16);
  const topicLabelLineH = scaleH(vp, 2);
  const topicGap = scaleH(vp, 16);

  // Deco line at GRID.decoLine2
  const deco2 = decoLine(vp, GRID.decoLine2);

  // Time info row — centered
  const timeHtml = `<div style="position:absolute;left:0;right:0;top:${timeInfoY}px;text-align:center;` +
    `font-family:${TYPE.timeInfo.font};font-size:${timeInfoSize}px;font-weight:${TYPE.timeInfo.weight};` +
    `letter-spacing:${TYPE.timeInfo.spacing};color:${TOKENS.interview.textDim};white-space:nowrap">` +
    `${esc(origRange)}</div>`;

  // Topic zone — label line + topic text + tags
  // Gold topic label with gradient line
  const labelLineY = topicZoneY + scaleH(vp, 10);
  const topicLabelHtml = `<div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${labelLineY}px;display:flex;align-items:center;gap:${topicLabelGap}px">` +
    `<span style="font-family:${TYPE.topicLabel.font};font-size:${topicLabelSize}px;font-weight:${TYPE.topicLabel.weight};` +
    `letter-spacing:${TYPE.topicLabel.spacing};color:${TOKENS.interview.gold};white-space:nowrap">${esc(topicLabel)}</span>` +
    `<div style="flex:1;height:${topicLabelLineH}px;background:linear-gradient(90deg,${TOKENS.interview.gold} 0%,transparent 100%);opacity:0.3"></div>` +
    `</div>`;

  // Topic text
  const topicTextY = labelLineY + scaleH(vp, 40) + topicGap;
  const topicTextHtml = topic ? `<div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${topicTextY}px;` +
    `font-family:${TYPE.topicText.font};font-size:${topicTextSize}px;font-weight:${TYPE.topicText.weight};` +
    `line-height:${TYPE.topicText.lineHeight};color:${TOKENS.interview.textDim};word-break:break-all">` +
    `${esc(topic)}</div>` : "";

  // Tags row — placed relative to topic text bottom
  const tagsY = topicTextY + scaleH(vp, 60) + topicGap;
  let tagsHtml = "";
  if (tagList.length > 0) {
    const tagItems = tagList.map(tag =>
      `<span style="display:inline-block;padding:${tagPadV}px ${tagPadH}px;` +
      `font-family:${TYPE.tag.font};font-size:${tagSize}px;font-weight:${TYPE.tag.weight};` +
      `letter-spacing:${TYPE.tag.spacing};color:${TOKENS.interview.tagText};` +
      `background:${TOKENS.interview.tagBg};border:${tagBorder}px solid ${TOKENS.interview.tagBorder};` +
      `border-radius:${tagRadius}px;white-space:nowrap">${esc(tag)}</span>`
    ).join(`<span style="display:inline-block;width:${tagGap}px"></span>`);

    tagsHtml = `<div style="position:absolute;left:${sidePad}px;top:${tagsY}px;display:flex;align-items:center;flex-wrap:nowrap">` +
      tagItems + `</div>`;
  }

  return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;height:${vp.height}px;pointer-events:none;opacity:${opacity}">` +
    deco2 +
    timeHtml +
    topicLabelHtml +
    topicTextHtml +
    tagsHtml +
    `</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "淡入开始", params: { origRange: "00:00 – 08:42", topicLabel: "正在聊", topic: "用 AI 做视频到底有多快？", tags: "AI制作,自动化,效率" } },
    { t: 0.5, label: "淡入完成", params: { origRange: "00:00 – 08:42", topicLabel: "正在聊", topic: "用 AI 做视频到底有多快？", tags: "AI制作,自动化,效率" } },
    { t: 10, label: "稳定态", params: { origRange: "00:00 – 08:42", topicLabel: "正在聊", topic: "用 AI 做视频到底有多快？", tags: "AI制作,自动化,效率" } },
  ];
}

export function lint(params) {
  const errors = [];
  if (params.tags) {
    const count = params.tags.split(",").filter(s => s.trim()).length;
    if (count > 3) errors.push(`tags 最多3个，当前 ${count} 个。Fix: 删减到3个以内`);
  }
  if (params.topic && params.topic.length > 60) {
    errors.push("topic 建议不超过60字，过长会影响布局。Fix: 缩减话题文字");
  }
  return { ok: errors.length === 0, errors };
}
