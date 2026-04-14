import { TOKENS, esc, escAttr, easeOutCubic, fadeIn, sw16, sh16 } from "../../../shared/design.js";

export const meta = {
  id: "slideChrome", version: 1, ratio: "16:9", category: "overlays",
  label: "Slide Chrome",
  description: "讲解视频顶栏：左侧品牌名、中间系列横幅、右侧章节水印。纯文字叠加层，不含背景。",
  tech: "dom", duration_hint: 30, loopable: true, z_hint: "top",
  tags: ["顶栏", "chrome", "brand", "series", "watermark", "overlay", "lecture"],
  mood: ["professional", "calm"],
  theme: ["education", "lecture", "talk"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": {
      brandColor: TOKENS.lecture.gold,
      seriesBg: "rgba(218,119,86,0.15)",
      seriesColor: TOKENS.lecture.accent,
      epTitleColor: "rgba(245,236,224,0.6)",
      watermarkColor: "rgba(218,119,86,0.12)",
    },
    "dark-minimal": {
      brandColor: "#8ab4cc",
      seriesBg: "rgba(138,180,204,0.15)",
      seriesColor: "#8ab4cc",
      epTitleColor: "rgba(255,255,255,0.5)",
      watermarkColor: "rgba(138,180,204,0.10)",
    },
    "gold-accent": {
      brandColor: TOKENS.lecture.gold,
      seriesBg: "rgba(212,180,131,0.18)",
      seriesColor: TOKENS.lecture.gold,
      epTitleColor: "rgba(245,236,224,0.55)",
      watermarkColor: "rgba(212,180,131,0.10)",
    },
  },
  params: {
    brand:         { type: "string", default: "OPC · 王宇轩", label: "左侧品牌名", semantic: "brand name shown at top-left, e.g. channel name or author", group: "content" },
    series:        { type: "string", default: "《深入浅出 Claude Code 源代码》", label: "系列名横幅", semantic: "series title shown in center banner with colored background pill", group: "content" },
    epTitle:       { type: "string", default: "以终为始：从最终提示词倒推逻辑", label: "章节副标题", semantic: "episode/chapter subtitle shown to the right of the series banner", group: "content" },
    watermark:     { type: "string", default: "E01", label: "水印文字（右上角）", semantic: "large faint watermark at top-right, typically episode number like E01, E02", group: "content" },
    barHeight:     { type: "number", default: 50, label: "顶栏高度(px)", semantic: "height of the top bar area in pixels", group: "style", range: [36, 80], step: 2 },
    fontSize:      { type: "number", default: 14, label: "文字字号(px)", semantic: "font size for brand, series, and episode title text", group: "style", range: [10, 20], step: 1 },
    brandColor:    { type: "color", default: TOKENS.lecture.gold, label: "品牌色", group: "color" },
    seriesBg:      { type: "color", default: "rgba(218,119,86,0.15)", label: "系列横幅背景", group: "color" },
    seriesColor:   { type: "color", default: TOKENS.lecture.accent, label: "系列文字色", group: "color" },
    epTitleColor:  { type: "color", default: "rgba(245,236,224,0.6)", label: "章节副标题色", group: "color" },
    watermarkColor:{ type: "color", default: "rgba(218,119,86,0.12)", label: "水印颜色", group: "color" },
    watermarkSize: { type: "number", default: 120, label: "水印字号(px)", semantic: "font size of the large faint watermark at top-right", group: "style", range: [60, 200], step: 10 },
  },
  ai: {
    when: "讲解视频、课程视频顶栏。始终放在最顶层（z_hint:top），覆盖在背景和内容 scene 之上。",
    how: "放在 layers 最后一项确保在最上层。brand/series/epTitle/watermark 四个文字参数按需填写。",
    example: {
      brand: "OPC · 王宇轩",
      series: "《深入浅出 Claude Code 源代码》",
      epTitle: "以终为始：从最终提示词倒推逻辑",
      watermark: "E01",
    },
    theme_guide: "anthropic-warm=暖橙色调 dark-minimal=冷蓝色调 gold-accent=金色调",
    avoid: "不要把背景色放在这个 scene 里，背景用 darkGradient 等背景 scene 实现。",
    pairs_with: ["darkGradient", "subtitleBar", "progressBar16x9", "headlineCenter", "codeTerminal"],
  },
};

export function render(t, params, vp) {
  const p = {};
  for (const k in meta.params) p[k] = params[k] !== undefined ? params[k] : meta.params[k].default;

  const W = vp.width;
  const H = vp.height;
  const barH = p.barHeight;
  const fs = p.fontSize;

  // Brand (left)
  const brandHtml = p.brand
    ? '<div style="font:600 ' + fs + 'px system-ui,sans-serif;color:' + p.brandColor + ';white-space:nowrap">' +
      esc(p.brand) + '</div>'
    : '';

  // Series banner + episode title (center)
  const seriesHtml = p.series
    ? '<div style="background:' + p.seriesBg + ';color:' + p.seriesColor + ';' +
      'font:500 ' + fs + 'px system-ui,sans-serif;padding:6px 16px;border-radius:4px;white-space:nowrap">' +
      esc(p.series) + '</div>'
    : '';
  const epHtml = p.epTitle
    ? '<div style="font:400 ' + fs + 'px system-ui,sans-serif;color:' + p.epTitleColor + ';white-space:nowrap;margin-left:12px">' +
      esc(p.epTitle) + '</div>'
    : '';
  const centerHtml = '<div style="display:flex;align-items:center">' + seriesHtml + epHtml + '</div>';

  // Watermark (top-right absolute)
  const wmHtml = p.watermark
    ? '<div style="position:absolute;top:-20px;right:30px;font:900 ' + p.watermarkSize + 'px system-ui,sans-serif;' +
      'color:' + p.watermarkColor + ';line-height:1;pointer-events:none;user-select:none">' +
      esc(p.watermark) + '</div>'
    : '';

  return '<div style="position:absolute;top:0;left:0;width:' + W + 'px;height:' + H + 'px;pointer-events:none">' +
    // Top bar row
    '<div style="position:absolute;top:0;left:0;right:0;height:' + barH + 'px;' +
    'display:flex;align-items:center;justify-content:space-between;padding:0 30px">' +
      brandHtml +
      centerHtml +
      '<div></div>' + // right spacer (watermark is absolute)
    '</div>' +
    // Watermark
    wmHtml +
  '</div>';
}

export function screenshots() {
  return [
    { t: 0, label: "顶栏初始状态" },
    { t: 5, label: "顶栏中段" },
    { t: 15, label: "顶栏后段" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!params.brand && !params.series && !params.watermark) {
    errors.push("brand / series / watermark 至少填一个。Fix: 填写 brand 或 series 参数");
  }
  if (params.watermarkSize !== undefined && (params.watermarkSize < 60 || params.watermarkSize > 200)) {
    errors.push("watermarkSize 必须在 60-200 之间。Fix: 当前值 " + params.watermarkSize + " 超出范围");
  }
  if (params.fontSize !== undefined && (params.fontSize < 10 || params.fontSize > 20)) {
    errors.push("fontSize 必须在 10-20 之间。Fix: 当前值 " + params.fontSize);
  }
  return { ok: errors.length === 0, errors };
}
