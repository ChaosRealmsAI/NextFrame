export const meta = {
  id: "slideChrome",
  version: 1,
  ratio: "16:9",
  category: "overlays",
  label: "Slide Chrome",
  description: "讲解视频的顶栏装饰层：品牌名 + 系列名 + 集标题 + 大号半透明水印。持久显示在所有内容层之上。",
  tech: "dom",
  duration_hint: 60,
  loopable: true,
  z_hint: "top",
  tags: ["chrome", "顶栏", "品牌", "水印", "overlay"],
  mood: ["professional"],
  theme: ["tech", "education"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": { brandColor:"#f5ece0", seriesColor:"#da7756", titleColor:"#f5ece0", ruleColor:"rgba(245,236,224,.1)", watermarkColor:"rgba(218,119,86,.12)", dimColor:"rgba(245,236,224,.35)" },
    "dark-minimal": { brandColor:"#ffffff", seriesColor:"#8ab4cc", titleColor:"#ffffff", ruleColor:"rgba(255,255,255,.08)", watermarkColor:"rgba(138,180,204,.08)", dimColor:"rgba(255,255,255,.3)" },
    "light": { brandColor:"#1a1a1a", seriesColor:"#da7756", titleColor:"#1a1a1a", ruleColor:"rgba(0,0,0,.08)", watermarkColor:"rgba(218,119,86,.06)", dimColor:"rgba(0,0,0,.3)" }
  },
  params: {
    brand: { type:"string", default:"OPC · 王宇轩", label:"品牌名", semantic:"top-left brand text", group:"content" },
    series: { type:"string", default:"", label:"系列名", semantic:"series title in top bar center", group:"content" },
    epTitle: { type:"string", default:"", label:"集标题", semantic:"episode title after series name", group:"content" },
    watermark: { type:"string", default:"", label:"水印文字", semantic:"large semi-transparent text, usually episode number like E03", group:"content" },
    dim: { type:"string", default:"", label:"维度标注", semantic:"dimension counter like 05/15, shown top-right", group:"content" },
    // colors from theme
    brandColor: { type:"color", default:"#f5ece0", label:"品牌色", semantic:"brand text color", group:"color" },
    seriesColor: { type:"color", default:"#da7756", label:"系列色", semantic:"series name color", group:"color" },
    titleColor: { type:"color", default:"#f5ece0", label:"标题色", semantic:"episode title color", group:"color" },
    ruleColor: { type:"color", default:"rgba(245,236,224,.1)", label:"分割线色", semantic:"top bar bottom border color", group:"color" },
    watermarkColor: { type:"color", default:"rgba(218,119,86,.12)", label:"水印色", semantic:"watermark text color", group:"color" },
    dimColor: { type:"color", default:"rgba(245,236,224,.35)", label:"标注色", semantic:"dim counter color", group:"color" }
  },
  ai: {
    when: "任何讲解/教程视频都需要。作为最顶层 overlay，持续显示品牌和导航信息。",
    how: "timeline 里放在最高 layer。params 传 brand/series/epTitle/watermark。通常不需要动画。",
    example: { brand:"OPC · 王宇轩", series:"《深入浅出 Claude Code 源代码》", epTitle:"Hook 安检员", watermark:"E03", dim:"05 / 15" },
    theme_guide: { "anthropic-warm":"暖棕调，搭配 Anthropic 系列", "dark-minimal":"深色极简", "light":"浅色背景用" },
    avoid: "不要用于非讲解类视频（纯背景/数据展示等）",
    pairs_with: ["auroraGradient","codeTerminal","titleCard","subtitleBar","progressBar"]
  }
};

export function render(t, params, vp) {
  // Resolve params with defaults
  var p = {};
  for (var k in meta.params) { p[k] = params[k] !== undefined ? params[k] : meta.params[k].default; }

  var esc = function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};

  // Top bar: brand left, series+epTitle center, dim right
  var topBar = '<div style="position:absolute;top:0;left:0;right:0;height:60px;display:flex;align-items:center;padding:0 40px;border-bottom:1px solid '+p.ruleColor+';z-index:100">' +
    '<div style="font:900 20px system-ui,-apple-system,sans-serif;letter-spacing:.14em;color:'+p.brandColor+'">'+esc(p.brand)+'</div>' +
    '<div style="flex:1;text-align:center;font:600 18px system-ui,sans-serif;color:rgba(245,236,224,.75)">' +
      '<span style="color:'+p.seriesColor+';font-weight:800">'+esc(p.series)+'</span>' +
      (p.epTitle ? '  <span style="color:'+p.titleColor+';font-weight:900">'+esc(p.epTitle)+'</span>' : '') +
    '</div>' +
    (p.dim ? '<div style="font:500 16px \'SF Mono\',monospace;color:'+p.dimColor+'">'+esc(p.dim)+'</div>' : '') +
  '</div>';

  // Watermark
  var wm = p.watermark ? '<div style="position:absolute;top:40px;right:40px;font:900 120px system-ui;color:'+p.watermarkColor+';text-shadow:0 0 80px rgba(218,119,86,.06);z-index:1;letter-spacing:-.02em">'+esc(p.watermark)+'</div>' : '';

  return topBar + wm;
}

export function screenshots() {
  return [
    { t: 0, label: "顶栏 + 水印初始状态" },
    { t: 5, label: "持续显示" },
    { t: 30, label: "长时间保持不变" }
  ];
}

export function lint(params, vp) {
  var errors = [];
  if (!params.brand) errors.push("brand 不能为空。Fix: 传入品牌名如 'OPC · 王宇轩'");
  return { ok: errors.length === 0, errors: errors };
}
