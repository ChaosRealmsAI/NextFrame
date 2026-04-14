export const meta = {
  id: "titleCard", version: 1, ratio: "16:9", category: "typography",
  label: "Title Card", description: "讲解视频标题卡：小标签 + 大标题 + 副标题。支持 HTML 标签（如 <span> 变色）。通常放在右侧，与左侧内容（终端/图表）搭配。",
  tech: "dom", duration_hint: 15, loopable: false, z_hint: "middle",
  tags: ["标题", "title", "大字", "eyebrow", "讲解"],
  mood: ["professional", "focused"], theme: ["tech", "education"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": { eyebrowColor:"#da7756", titleColor:"#f5ece0", subtitleColor:"rgba(245,236,224,.75)", accentColor:"#da7756" },
    "dark-blue": { eyebrowColor:"#8ab4cc", titleColor:"#ffffff", subtitleColor:"rgba(255,255,255,.7)", accentColor:"#8ab4cc" },
    "warm-gold": { eyebrowColor:"#d4b483", titleColor:"#f5ece0", subtitleColor:"rgba(245,236,224,.7)", accentColor:"#d4b483" }
  },
  params: {
    eyebrow: { type:"string", default:"", label:"小标签", semantic:"uppercase mono tag above title, e.g. DIMENSION 05", group:"content" },
    title: { type:"string", required:true, label:"主标题", semantic:"big serif title, supports inline HTML for accent spans", group:"content" },
    subtitle: { type:"string", default:"", label:"副标题", semantic:"smaller body text below title", group:"content" },
    x: { type:"number", default:700, label:"X起点(px)", semantic:"left edge position", group:"style", range:[0,1920], step:10 },
    eyebrowDelay: { type:"number", default:0.3, label:"小标签出现时间(s)", semantic:"eyebrow fade-in start time", group:"animation", range:[0,5], step:0.1 },
    titleDelay: { type:"number", default:0.8, label:"标题出现时间(s)", semantic:"title fade-in start time", group:"animation", range:[0,5], step:0.1 },
    subtitleDelay: { type:"number", default:2.0, label:"副标题出现时间(s)", semantic:"subtitle fade-in start time", group:"animation", range:[0,10], step:0.1 },
    eyebrowColor: { type:"color", default:"#da7756", label:"标签色", semantic:"eyebrow text color", group:"color" },
    titleColor: { type:"color", default:"#f5ece0", label:"标题色", semantic:"title text color", group:"color" },
    subtitleColor: { type:"color", default:"rgba(245,236,224,.75)", label:"副标题色", semantic:"subtitle text color", group:"color" },
  },
  ai: {
    when: "每个 phase 的主标题展示。放在右侧（x=700），左侧放 codeTerminal 或图表。",
    how: "title 支持 HTML：用 <span style=\"color:#da7756\">重点</span> 给关键词上色。",
    example: { eyebrow:"DIMENSION 05", title:'Hook<br><span style="color:#da7756">AI 操作的拦门</span>', subtitle:"类比 Git Hook，拦截 AI 的危险操作", x:700 },
    theme_guide: { "anthropic-warm":"暖橙色调", "dark-blue":"冷蓝色调", "warm-gold":"金色调" },
    avoid: "不适合纯数据展示或代码展示，那些用 codeTerminal 或 barChartReveal。",
    pairs_with: ["codeTerminal","slideChrome","auroraGradient","tagCompare"]
  }
};

function ease3(p){return 1-Math.pow(1-Math.max(0,Math.min(1,p)),3)}
function fadeIn(t,start,dur){return ease3((t-start)/dur)}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

export function render(t, params, vp) {
  var p = {};
  for(var k in meta.params) p[k] = params[k]!==undefined ? params[k] : meta.params[k].default;
  var x = p.x || 700;
  var w = 1920 - x - 60;
  var eyOp = fadeIn(t, p.eyebrowDelay||0.3, 0.5);
  var titOp = fadeIn(t, p.titleDelay||0.8, 0.7);
  var subOp = fadeIn(t, p.subtitleDelay||2.0, 0.7);
  // title allows HTML (for accent spans), don't escape it
  var titleHtml = p.title || '';
  return '<div style="position:absolute;left:'+x+'px;right:60px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:20px">' +
    (p.eyebrow ? '<div style="font:700 14px \'SF Mono\',\'JetBrains Mono\',monospace;letter-spacing:.16em;text-transform:uppercase;color:'+p.eyebrowColor+';opacity:'+eyOp+'">'+esc(p.eyebrow)+'</div>' : '') +
    '<div style="font:700 48px Georgia,\'Noto Serif SC\',serif;color:'+p.titleColor+';line-height:1.3;opacity:'+titOp+'">'+titleHtml+'</div>' +
    (p.subtitle ? '<div style="font:500 20px system-ui,\'PingFang SC\',sans-serif;color:'+p.subtitleColor+';line-height:1.6;opacity:'+subOp+'">'+esc(p.subtitle)+'</div>' : '') +
  '</div>';
}

export function screenshots() {
  return [
    { t: 0, label: "初始（全透明）" },
    { t: 1, label: "标签+标题出现" },
    { t: 3, label: "全部可见" }
  ];
}

export function lint(params, vp) {
  var errors = [];
  if (!params.title) errors.push("title 不能为空。Fix: 传入主标题文字");
  return { ok: errors.length===0, errors: errors };
}
