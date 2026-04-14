export const meta = {
  id: "interviewMeta",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Meta",
  description: "元数据行 + 正在看标签 + 描述 + 药丸标签组，访谈切片下半区信息层",
  tech: "dom",
  duration_hint: 20,
  loopable: true,
  z_hint: "top",
  tags: ["overlays", "interview", "meta", "tags", "9x16"],
  mood: ["professional"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": {
      metaColor: "rgba(245,236,224,0.3)",
      watchingColor: "#da7756",
      descColor: "rgba(245,236,224,0.5)",
      tagBorder: "rgba(245,236,224,0.15)",
      tagText: "rgba(245,236,224,0.5)",
    },
  },
  params: {
    metaLine: { type: "string", default: "原片 2:22:18 | 内容来源 00:08 - 01:21", label: "元数据行文字", group: "content" },
    watchingDesc: { type: "string", default: "这段讲的是指数增长还会持续多久", label: "正在看描述", group: "content" },
    tags: { type: "string", default: "Dwarkesh访谈,Dario Amodei,原声 1:21", label: "标签（逗号分隔）", group: "content" },
    metaColor: { type: "color", default: "rgba(245,236,224,0.3)", label: "元数据文字颜色", group: "color" },
    watchingColor: { type: "color", default: "#da7756", label: "正在看标签颜色", group: "color" },
    descColor: { type: "color", default: "rgba(245,236,224,0.5)", label: "描述文字颜色", group: "color" },
    tagBorder: { type: "color", default: "rgba(245,236,224,0.15)", label: "标签边框颜色", group: "color" },
    tagText: { type: "color", default: "rgba(245,236,224,0.5)", label: "标签文字颜色", group: "color" },
  },
  ai: {
    when: "访谈切片中下区域：元数据 + 正在看描述 + 标签组",
    how: '{ scene: "interviewMeta", start: 0, dur: 20, params: { metaLine: "原片 2:22:18 | 内容来源 00:08 - 01:21", watchingDesc: "...", tags: "标签1,标签2" } }',
    example: { metaLine: "原片 2:22:18 | 内容来源 00:08 - 01:21", watchingDesc: "这段讲的是指数增长还会持续多久", tags: "Dwarkesh访谈,Dario Amodei,原声 1:21" },
    avoid: "tags 用逗号分隔字符串，不是数组",
    pairs_with: ["interviewBg", "interviewHeader", "interviewVideoArea", "interviewBiSub"],
  },
};

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

export function render(t, params, vp) {
  const metaLine = esc(params.metaLine || "原片 2:22:18 | 内容来源 00:08 - 01:21");
  const watchingDesc = esc(params.watchingDesc || "");
  const tagsRaw = params.tags || "";
  const tagList = Array.isArray(tagsRaw) ? tagsRaw : String(tagsRaw).split(",").map(s => s.trim()).filter(Boolean);
  const metaColor = params.metaColor || "rgba(245,236,224,0.3)";
  const watchingColor = params.watchingColor || "#da7756";
  const descColor = params.descColor || "rgba(245,236,224,0.5)";
  const tagBorder = params.tagBorder || "rgba(245,236,224,0.15)";
  const tagText = params.tagText || "rgba(245,236,224,0.5)";

  const fadeAlpha = Math.min(1, ease3(Math.min(1, t * 3)));

  // Spec: metaLine y=960, watchingDesc y=1020, tags y=1120
  const metaY = Math.round(vp.height * 960 / 1920);
  const watchingY = Math.round(vp.height * 1020 / 1920);
  const tagsY = Math.round(vp.height * 1120 / 1920);
  const pad = Math.round(vp.width * 0.06);

  const metaFontSize = Math.round(vp.width * 14 / 1080);
  const watchingLabelSize = Math.round(vp.width * 12 / 1080);
  const watchingDescSize = Math.round(vp.width * 14 / 1080);
  const tagFontSize = Math.round(vp.width * 13 / 1080);
  const tagPadH = Math.round(vp.width * 12 / 1080);
  const tagPadV = Math.round(vp.width * 5 / 1080);
  const tagGap = Math.round(vp.width * 8 / 1080);

  const tagsHtml = tagList.map(tag =>
    `<span style="border:1px solid ${tagBorder};border-radius:999px;padding:${tagPadV}px ${tagPadH}px;font-size:${tagFontSize}px;color:${tagText};white-space:nowrap">${esc(tag)}</span>`
  ).join(`<span style="display:inline-block;width:${tagGap}px"></span>`);

  return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;opacity:${fadeAlpha};pointer-events:none">
  <div style="position:absolute;left:0;top:${metaY}px;width:${vp.width}px;text-align:center">
    <span style="font-family:system-ui,'PingFang SC',sans-serif;font-size:${metaFontSize}px;font-weight:400;color:${metaColor}">${metaLine}</span>
  </div>
  <div style="position:absolute;left:${pad}px;top:${watchingY}px;width:${vp.width - pad*2}px">
    <span style="font-family:system-ui,'PingFang SC',sans-serif;font-size:${watchingLabelSize}px;font-weight:600;color:${watchingColor};letter-spacing:0.04em">正在看</span>
    <span style="font-family:system-ui,'PingFang SC',sans-serif;font-size:${watchingDescSize}px;font-weight:400;color:${descColor};margin-left:${Math.round(vp.width*6/1080)}px">${watchingDesc}</span>
  </div>
  <div style="position:absolute;left:0;top:${tagsY}px;width:${vp.width}px;text-align:center;white-space:nowrap">
    ${tagsHtml}
  </div>
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
