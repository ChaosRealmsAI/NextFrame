import { TOKENS, esc, fadeIn, scaleH, scaleW } from "../../../shared/design.js";

export const meta = {
  id: "interviewMeta",
  version: 2,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Meta",
  description: "Metadata row, watching line, and left-aligned editorial tags.",
  tech: "dom",
  duration_hint: 20,
  loopable: true,
  z_hint: "top",
  tags: ["overlays", "interview", "meta", "tags", "9x16"],
  mood: ["editorial"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": {
      metaColor: TOKENS.interview.muted,
      watchingColor: TOKENS.interview.warm,
      descColor: TOKENS.interview.secondary,
      tagBorder: TOKENS.interview.tagBorder,
      tagText: TOKENS.interview.tagText,
      tagBg: TOKENS.interview.tagBg,
    },
  },
  params: {
    metaLine: { type: "string", default: "原片 2:22:18 | 内容来源 00:08 - 01:21", label: "元数据行文字", group: "content" },
    watchingDesc: { type: "string", default: "Dario: 技术指数如期而至，但大众未觉终局将近", label: "正在看描述", group: "content" },
    tags: { type: "string", default: "Dwarkesh访谈,Dario Amodei,原声 1:21", label: "标签", group: "content" },
    metaColor: { type: "color", default: TOKENS.interview.muted, label: "元数据文字颜色", group: "color" },
    watchingColor: { type: "color", default: TOKENS.interview.warm, label: "正在看颜色", group: "color" },
    descColor: { type: "color", default: TOKENS.interview.secondary, label: "描述颜色", group: "color" },
    tagBorder: { type: "color", default: TOKENS.interview.tagBorder, label: "标签边框颜色", group: "color" },
    tagText: { type: "color", default: TOKENS.interview.tagText, label: "标签文字颜色", group: "color" },
    tagBg: { type: "color", default: TOKENS.interview.tagBg, label: "标签背景色", group: "color" },
  },
};

export function render(t, params, vp) {
  const metaLine = esc(params.metaLine || "原片 2:22:18 | 内容来源 00:08 - 01:21");
  const watchingDesc = esc(params.watchingDesc || "");
  const tagsRaw = params.tags || "";
  const tagList = Array.isArray(tagsRaw)
    ? tagsRaw
    : String(tagsRaw).split(",").map((item) => item.trim()).filter(Boolean);
  const metaColor = params.metaColor || TOKENS.interview.muted;
  const watchingColor = params.watchingColor || TOKENS.interview.warm;
  const descColor = params.descColor || TOKENS.interview.secondary;
  const tagBorder = params.tagBorder || TOKENS.interview.tagBorder;
  const tagText = params.tagText || TOKENS.interview.tagText;
  const tagBg = params.tagBg || TOKENS.interview.tagBg;
  const alpha = fadeIn(t, 0.08, 0.5);
  const metaY = scaleH(vp, 1218, 1920);
  const watchingY = scaleH(vp, 1290, 1920);
  const tagsY = scaleH(vp, 1360, 1920);
  const left = scaleW(vp, 82, 1080);
  const right = scaleW(vp, 82, 1080);
  const metaSize = scaleW(vp, 13, 1080);
  const labelSize = scaleW(vp, 12, 1080);
  const descSize = scaleW(vp, 15, 1080);
  const tagSize = scaleW(vp, 13, 1080);
  const tagPadX = scaleW(vp, 14, 1080);
  const tagPadY = scaleW(vp, 7, 1080);
  const tagGap = scaleW(vp, 12, 1080);
  const tagsHtml = tagList
    .map(
      (tag) =>
        `<span style="display:inline-flex;align-items:center;padding:${tagPadY}px ${tagPadX}px;border-radius:${scaleW(vp, 8, 1080)}px;background:${tagBg};border:1px solid ${tagBorder};font-family:'SF Pro Text','PingFang SC',sans-serif;font-size:${tagSize}px;font-weight:600;color:${tagText};white-space:nowrap">${esc(tag)}</span>`,
    )
    .join("");
  return `<div style="position:absolute;inset:0;pointer-events:none;opacity:${alpha}">
  <div style="position:absolute;left:0;right:0;top:${metaY}px;text-align:center">
    <span style="font-family:'SF Pro Text','PingFang SC',sans-serif;font-size:${metaSize}px;font-weight:500;color:${metaColor};letter-spacing:0.08em">${metaLine}</span>
  </div>
  <div style="position:absolute;left:${left}px;right:${right}px;top:${watchingY}px">
    <span style="font-family:'SF Pro Text','PingFang SC',sans-serif;font-size:${labelSize}px;font-weight:700;color:${watchingColor};letter-spacing:0.08em">正在看</span>
    <span style="font-family:'PingFang SC','Noto Sans SC',sans-serif;font-size:${descSize}px;font-weight:600;color:${descColor};margin-left:${scaleW(vp, 10, 1080)}px">${watchingDesc}</span>
  </div>
  <div style="position:absolute;left:${left}px;right:${right}px;top:${tagsY}px;display:flex;gap:${tagGap}px;flex-wrap:wrap;justify-content:flex-start">${tagsHtml}</div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0.1, label: "元数据淡入" },
    { t: 10, label: "标签显示中" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.metaLine) errors.push("metaLine 元数据行不能为空。Fix: 传入原片时长和内容来源时间");
  return { ok: errors.length === 0, errors };
}
