// interviewChrome — 硅谷访谈 9:16 静态底层：背景 + 标题 + 元信息 + 品牌
// 全程不变。不放字幕/进度/视频（它们是动态层）。

import { getPreset, esc, scaleW, scaleH, decoLine } from "../../../shared/design.js";

export const meta = {
  id: "interviewChrome",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Chrome",
  description: "硅谷访谈静态底层：背景+网格+标题栏+话题区+品牌栏。全程不变，搭配 interviewBiSub + progressBar9x16 + interviewVideoArea 使用。",
  tech: "dom",
  duration_hint: 80,
  loopable: false,
  z_hint: "bottom",
  tags: ["interview", "chrome", "9x16", "dark"],
  mood: ["professional"],
  theme: ["tech"],
  default_theme: "interview-dark",
  themes: { "interview-dark": {} },
  params: {
    seriesName: { type: "string", default: "速通硅谷访谈", label: "系列名", group: "content" },
    episode:    { type: "string", default: "E01", label: "集数", group: "content" },
    guest:      { type: "string", default: "Dario Amodei", label: "嘉宾", group: "content" },
    title:      { type: "string", default: "指数快到头了，大众浑然不知", label: "标题", group: "content" },
    origRange:  { type: "string", default: "", label: "原片时间范围", group: "content" },
    topicLabel: { type: "string", default: "正在聊", label: "话题标签", group: "content" },
    topic:      { type: "string", default: "", label: "话题正文", group: "content" },
    tags:       { type: "array",  default: [], label: "标签列表（max 3）", group: "content" },
    brand:      { type: "string", default: "OPC · 王宇轩", label: "品牌名", group: "brand" },
    teamLine:   { type: "string", default: "该视频由数字员工 Alysa 全自动负责剪辑·翻译·字幕·讲解·封面·发布", label: "员工签名行", group: "brand" },
  },
  ai: {
    when: "9:16 访谈视频的静态底层，放在最下面的 z 层。全程持续整个片段时长。",
    how: "{ scene: 'interviewChrome', start: 0, dur: <clip_duration>, params: { seriesName, episode, guest, title, topic, tags, ... } }",
    example: { seriesName: "速通硅谷访谈", episode: "E01", guest: "Dario Amodei", title: "指数快到头了，大众浑然不知" },
    avoid: "不要在这个层放字幕或进度条",
    pairs_with: ["interviewBiSub", "interviewVideoArea", "progressBar9x16"],
  },
};

export function render(t, params, vp) {
  const preset = getPreset("interview-dark");
  const { colors, layout, type } = preset;
  const bW = layout.baseW;
  const bH = layout.baseH;

  const seriesName = params.seriesName || "速通硅谷访谈";
  const episode    = params.episode    || "E01";
  const guest      = params.guest      || "Dario Amodei";
  const title      = params.title      || "";
  const origRange  = params.origRange  || "";
  const topicLabel = params.topicLabel || "正在聊";
  const topic      = params.topic      || "";
  const tagList    = Array.isArray(params.tags) ? params.tags : [];
  const brand      = params.brand      || "OPC · 王宇轩";
  const teamLine   = params.teamLine   || "该视频由数字员工 Alysa 全自动负责剪辑·翻译·字幕·讲解·封面·发布";

  // Scale helpers
  const sw = (px) => scaleW(vp, px, bW);
  const sh = (px) => scaleH(vp, px, bH);

  const sidePad = sw(layout.sidePad);

  // ── Background layer ──
  const bgLayer = `<div style="position:absolute;inset:0;background:${colors.bg}">` +
    `<div style="position:absolute;inset:0;background:radial-gradient(ellipse at 50% 20%,${colors.glowTop} 0%,transparent 60%),radial-gradient(ellipse at 50% 85%,${colors.glowBottom} 0%,transparent 50%)"></div>` +
    `<div style="position:absolute;inset:0;pointer-events:none;opacity:1;background-image:radial-gradient(${colors.gridDot} 1px,transparent 1px);background-size:${sw(20)}px ${sh(20)}px"></div>` +
    `<div style="position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at 50% 45%,transparent 40%,${colors.vignette} 100%)"></div>` +
    `</div>`;

  // ── Header ──
  const hTop    = sh(layout.header.top);
  const hHeight = sh(layout.header.height);
  const seriesLabel = `${seriesName} · ${episode} · ${guest}`;
  const headerLayer = `<div style="position:absolute;left:0;right:0;top:${hTop}px;height:${hHeight}px;padding:0 ${sidePad}px ${sh(12)}px;display:flex;flex-direction:column;justify-content:flex-end;box-sizing:border-box;z-index:10">` +
    `<div style="font-size:${sw(type.seriesName.size)}px;font-weight:${type.seriesName.weight};color:${colors.primary};text-align:center;letter-spacing:${type.seriesName.spacing};margin-bottom:${sh(6)}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:${type.seriesName.font}">${esc(seriesLabel)}</div>` +
    `<div style="font-size:${sw(type.title.size)}px;font-weight:${type.title.weight};color:${colors.text};line-height:${type.title.lineHeight};text-align:center;letter-spacing:${type.title.spacing};font-family:${type.title.font}">${esc(title)}</div>` +
    `</div>`;

  // ── Deco line 1 (below header) ──
  const deco1 = decoLine(vp, layout.decoLine1, colors, bW, bH);

  // ── Time info ──
  const timeInfoY = sh(layout.timeInfo);
  const timeLayer = origRange
    ? `<div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${timeInfoY}px;font-size:${sw(type.timeInfo.size)}px;font-weight:${type.timeInfo.weight};color:rgba(232,196,122,0.4);font-family:${type.timeInfo.font};text-align:center;letter-spacing:${type.timeInfo.spacing};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;z-index:10">${esc(origRange)}</div>`
    : "";

  // ── Topic zone ──
  const topicTop    = sh(layout.topic.top);
  const topicHeight = sh(layout.topic.height);
  const tagsHtml = tagList.slice(0, 3).map((tag) =>
    `<span style="flex-shrink:0;font-size:${sw(type.tag.size)}px;font-weight:${type.tag.weight};color:${colors.tagText};font-family:${type.tag.font};background:${colors.tagBg};border:0.5px solid ${colors.tagBorder};padding:${sh(4)}px ${sw(10)}px;border-radius:${sw(4)}px;letter-spacing:${type.tag.spacing};white-space:nowrap">${esc(tag)}</span>`
  ).join("");
  const topicLayer = `<div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${topicTop}px;height:${topicHeight}px;padding-top:${sh(6)}px;box-sizing:border-box;z-index:10">` +
    `<div style="font-size:${sw(type.topicLabel.size)}px;font-weight:${type.topicLabel.weight};color:${colors.primary};letter-spacing:${type.topicLabel.spacing};font-family:${type.topicLabel.font};display:flex;align-items:center;gap:${sw(8)}px">${esc(topicLabel)}<div style="flex:1;height:0.5px;background:linear-gradient(90deg,rgba(232,196,122,0.25),transparent)"></div></div>` +
    `<div style="font-size:${sw(type.topicText.size)}px;font-weight:${type.topicText.weight};color:${colors.textDim};font-family:${type.topicText.font};line-height:${type.topicText.lineHeight};margin-top:${sh(8)}px;max-height:${sh(80)}px;overflow:hidden">${esc(topic)}</div>` +
    `<div style="margin-top:${sh(10)}px;display:flex;flex-wrap:nowrap;gap:${sw(6)}px;overflow:hidden">${tagsHtml}</div>` +
    `</div>`;

  // ── Deco line 2 ──
  const deco2 = decoLine(vp, layout.decoLine2, colors, bW, bH);

  // ── Deco line 3 ──
  const deco3 = decoLine(vp, layout.decoLine3, colors, bW, bH);

  // ── Brand bar ──
  const brandY = sh(layout.brand);
  const brandLayer = `<div style="position:absolute;left:0;right:0;top:${brandY}px;height:${sh(30)}px;display:flex;align-items:center;justify-content:center;z-index:10">` +
    `<span style="font-size:${sw(type.brand.size)}px;font-weight:${type.brand.weight};color:${colors.primary};font-family:${type.brand.font};letter-spacing:${type.brand.spacing}">${esc(brand)}</span>` +
    `</div>`;

  // ── Team line ──
  const teamY = sh(layout.teamLine);
  const teamLayer = `<div style="position:absolute;left:0;right:0;top:${teamY}px;text-align:center;font-size:${sw(type.teamLine.size)}px;font-weight:${type.teamLine.weight};color:${colors.textFaint};font-family:${type.teamLine.font};letter-spacing:${type.teamLine.spacing};z-index:10">${esc(teamLine)}</div>`;

  return `<div style="position:absolute;inset:0;overflow:hidden">` +
    bgLayer +
    headerLayer +
    deco1 +
    timeLayer +
    topicLayer +
    deco2 +
    deco3 +
    brandLayer +
    teamLayer +
    `</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "start" },
    { t: 40, label: "mid" },
    { t: 79, label: "end" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.title) errors.push("title is required");
  return { ok: errors.length === 0, errors };
}
