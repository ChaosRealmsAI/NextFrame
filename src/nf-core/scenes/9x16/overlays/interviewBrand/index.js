export const meta = {
  id: "interviewBrand",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Brand",
  description: "品牌底栏：金色大字 OPC·名字 + 极弱小字副标，访谈切片品牌标识",
  tech: "dom",
  duration_hint: 20,
  loopable: true,
  z_hint: "top",
  tags: ["overlays", "interview", "brand", "9x16"],
  mood: ["professional"],
  theme: ["interview", "tech"],
  default_theme: "dark-interview",
  themes: {
    "dark-interview": { brandColor: "#d4b483", subColor: "rgba(245,236,224,0.25)" },
  },
  params: {
    brandName: { type: "string", default: "OPC · 王宇轩", label: "品牌名", group: "content" },
    subText: { type: "string", default: "速通硅谷访谈", label: "副标文字", group: "content" },
    brandColor: { type: "color", default: "#d4b483", label: "品牌名颜色（金色）", group: "color" },
    subColor: { type: "color", default: "rgba(245,236,224,0.25)", label: "副标颜色（极弱）", group: "color" },
  },
  ai: {
    when: "访谈切片底部品牌标识，y=1700",
    how: '{ scene: "interviewBrand", start: 0, dur: 20, params: { brandName: "OPC · 王宇轩", subText: "速通硅谷访谈" } }',
    example: { brandName: "OPC · 王宇轩", subText: "速通硅谷访谈" },
    avoid: "不要放太靠下，会被进度条遮住",
    pairs_with: ["interviewBg", "progressBar9x16"],
  },
};

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

export function render(t, params, vp) {
  const brandName = esc(params.brandName || "OPC · 王宇轩");
  const subText = esc(params.subText || "速通硅谷访谈");
  const brandColor = params.brandColor || "#d4b483";
  const subColor = params.subColor || "rgba(245,236,224,0.25)";

  const fadeAlpha = Math.min(1, ease3(Math.min(1, t * 3)));

  // Spec: y=1700
  const brandY = Math.round(vp.height * 1700 / 1920);
  const brandFontSize = Math.round(vp.width * 18 / 1080);
  const subFontSize = Math.round(vp.width * 12 / 1080);
  const lineGap = Math.round(vp.height * 10 / 1920);

  return `<div style="position:absolute;left:0;top:${brandY}px;width:${vp.width}px;opacity:${fadeAlpha};pointer-events:none;text-align:center">
  <div style="font-family:system-ui,'PingFang SC','Helvetica Neue',sans-serif;font-size:${brandFontSize}px;font-weight:600;color:${brandColor};letter-spacing:0.03em">${brandName}</div>
  <div style="font-family:system-ui,'PingFang SC',sans-serif;font-size:${subFontSize}px;font-weight:400;color:${subColor};margin-top:${lineGap}px;letter-spacing:0.02em">${subText}</div>
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
  if (!params.brandName) errors.push("brandName 品牌名不能为空。Fix: 传入品牌名");
  return { ok: errors.length === 0, errors };
}
