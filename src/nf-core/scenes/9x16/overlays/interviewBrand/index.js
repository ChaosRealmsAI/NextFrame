import { TOKENS, esc, fadeIn, scaleH, scaleW } from "../../../shared/design.js";

export const meta = {
  id: "interviewBrand",
  version: 2,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Brand",
  description: "Bottom brand lockup with small attribution line.",
  tech: "dom",
  duration_hint: 20,
  loopable: true,
  z_hint: "top",
  tags: ["overlays", "interview", "brand", "9x16"],
  mood: ["editorial"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": { brandColor: TOKENS.interview.gold, subColor: "rgba(245,236,224,0.22)" },
  },
  params: {
    brand: { type: "string", default: "OPC · 王宇轩", label: "品牌名", group: "content" },
    brandName: { type: "string", default: "OPC · 王宇轩", label: "品牌名兼容参数", group: "content" },
    subText: {
      type: "string",
      default: "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布",
      label: "副标文字",
      group: "content",
    },
    brandColor: { type: "color", default: TOKENS.interview.gold, label: "品牌名颜色", group: "color" },
    subColor: { type: "color", default: "rgba(245,236,224,0.22)", label: "副标颜色", group: "color" },
  },
};

export function render(t, params, vp) {
  const brandName = esc(params.brand || params.brandName || "OPC · 王宇轩");
  const subText = esc(
    params.subText ||
      "该视频由数字员工 Alysa 全自动负责剪辑 · 翻译 · 字幕 · 讲解 · 封面 · 发布",
  );
  const brandColor = params.brandColor || TOKENS.interview.gold;
  const subColor = params.subColor || "rgba(245,236,224,0.22)";
  const alpha = fadeIn(t, 0.12, 0.55);
  const dividerY = scaleH(vp, 1670, 1920);
  const top = scaleH(vp, 1718, 1920);
  const side = scaleW(vp, 80, 1080);
  const brandSize = scaleW(vp, 20, 1080);
  const subSize = scaleW(vp, 11, 1080);
  return `<div style="position:absolute;inset:0;pointer-events:none;opacity:${alpha}">
  <div style="position:absolute;left:${side}px;right:${side}px;top:${dividerY}px;height:1px;background:linear-gradient(90deg, transparent 0%, rgba(245,236,224,0.05) 10%, rgba(245,236,224,0.08) 50%, rgba(245,236,224,0.05) 90%, transparent 100%)"></div>
  <div style="position:absolute;left:0;right:0;top:${top}px;text-align:center">
    <div style="font-family:'Iowan Old Style','Songti SC','Noto Serif SC',serif;font-size:${brandSize}px;font-weight:700;color:${brandColor};letter-spacing:0.06em">${brandName}</div>
    <div style="margin-top:${scaleH(vp, 36, 1920)}px;padding:0 ${scaleW(vp, 110, 1080)}px;font-family:'SF Pro Text','PingFang SC',sans-serif;font-size:${subSize}px;font-weight:500;color:${subColor};letter-spacing:0.06em">${subText}</div>
  </div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0.1, label: "品牌栏淡入" },
    { t: 10, label: "品牌栏显示中" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.brand && !params.brandName) errors.push("brand 品牌名不能为空。Fix: 传入品牌名");
  return { ok: errors.length === 0, errors };
}
