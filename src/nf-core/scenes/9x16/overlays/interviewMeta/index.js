// interviewMeta — time info, topic zone, and tags
import { TOKENS, GRID, TYPE, scaleW, scaleH, esc } from "../../../shared/design.js";

export const meta = {
  id: "interviewMeta",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Meta",
  description: "Time info row, topic zone (label + text), and tag chips below the subtitle zone",
  tech: "dom",
  duration_hint: 60,
  default_theme: "dark-interview",
  themes: { "dark-interview": {} },
  params: {
    origRange:   { type: "string", default: "",         label: "Original time range text", group: "content" },
    topic:       { type: "string", default: "",         label: "Topic text (≤40 chars)", group: "content" },
    topicLabel:  { type: "string", default: "正在聊",   label: "Topic label", group: "content" },
    tags:        { type: "string", default: "",         label: "Comma-separated tags (max 3)", group: "content" },
  },
  ai: {
    when: "Use below subtitle zone on 9:16 interview slides to show clip metadata",
    how: "Pass origRange (time info string), topic, topicLabel, tags (comma-sep, max 3 tags, 10 chars each)",
  },
};

export function render(t, params, vp) {
  const { origRange = "", topic = "", topicLabel = "正在聊", tags = "" } = params;

  const gold = TOKENS.interview.gold;
  const textDim = TOKENS.interview.textDim;
  const tagBg = TOKENS.interview.tagBg;
  const tagBorder = TOKENS.interview.tagBorder;
  const tagText = TOKENS.interview.tagText;

  const pad = scaleW(vp, GRID.sidePad);
  const timeTop = scaleH(vp, GRID.timeInfo);
  const topicTop = scaleH(vp, GRID.topic.top);

  const timeSize = scaleW(vp, TYPE.timeInfo.size);
  const labelSize = scaleW(vp, TYPE.topicLabel.size);
  const topicSize = scaleW(vp, TYPE.topicText.size);
  const tagSize = scaleW(vp, TYPE.tag.size);

  const tagList = String(tags).split(",").map(s => s.trim()).filter(Boolean).slice(0, 3);
  const tagsHtml = tagList.map(tag =>
    `<span style="flex-shrink:0;font-size:${tagSize}px;color:${tagText};font-family:${TYPE.tag.font};background:${tagBg};border:0.5px solid ${tagBorder};padding:${scaleH(vp,4)}px ${scaleW(vp,10)}px;border-radius:${scaleW(vp,4)}px;letter-spacing:${TYPE.tag.spacing};white-space:nowrap">${esc(tag)}</span>`
  ).join("");

  return `<!-- Time info -->
${origRange ? `<div style="position:absolute;left:${pad}px;right:${pad}px;top:${timeTop}px;font-size:${timeSize}px;color:rgba(232,196,122,.4);font-family:${TYPE.timeInfo.font};text-align:center;letter-spacing:${TYPE.timeInfo.spacing};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">${esc(origRange)}</div>` : ""}
<!-- Topic zone -->
<div style="position:absolute;left:${pad}px;right:${pad}px;top:${topicTop}px;height:${scaleH(vp, GRID.topic.height)}px;padding-top:${scaleH(vp,6)}px;pointer-events:none">
  <div style="font-size:${labelSize}px;color:${gold};font-weight:${TYPE.topicLabel.weight};letter-spacing:${TYPE.topicLabel.spacing};font-family:${TYPE.topicLabel.font};display:flex;align-items:center;gap:${scaleW(vp,8)}px">
    ${esc(topicLabel)}
    <span style="flex:1;height:0.5px;background:linear-gradient(90deg,rgba(232,196,122,.25),transparent)"></span>
  </div>
  ${topic ? `<div style="margin-top:${scaleH(vp,8)}px;font-size:${topicSize}px;color:${textDim};font-weight:${TYPE.topicText.weight};line-height:${TYPE.topicText.lineHeight};font-family:${TYPE.topicText.font};overflow:hidden;max-height:${scaleH(vp,80)}px">${esc(topic)}</div>` : ""}
  ${tagList.length > 0 ? `<div style="margin-top:${scaleH(vp,10)}px;display:flex;flex-wrap:nowrap;gap:${scaleW(vp,6)}px;overflow:hidden">${tagsHtml}</div>` : ""}
</div>`;
}

export function screenshots() {
  return [
    { t: 0.5, label: "meta zone" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (params.topic && String(params.topic).length > 60) {
    errors.push("topic > 60 chars may overflow the topic zone");
  }
  return { ok: errors.length === 0, errors };
}
