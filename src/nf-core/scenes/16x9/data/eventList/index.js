export const meta = {
  id: "eventList", version: 1, ratio: "16:9", category: "data",
  label: "Event List", description: "竖向带连接线的点列表。支持高亮某一项（更大、橙色发光）。适合时间线、步骤列表、功能清单。",
  tech: "dom", duration_hint: 12, loopable: false, z_hint: "middle",
  tags: ["列表", "list", "timeline", "步骤", "dot"],
  mood: ["informative", "structured"], theme: ["tech", "education"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": {
      dotBorder: "rgba(245,236,224,.25)", highlightDot: "#da7756",
      titleColor: "#f5ece0", textColor: "rgba(245,236,224,.8)", lineColor: "rgba(245,236,224,.12)"
    },
    "dark-blue": {
      dotBorder: "rgba(138,180,204,.3)", highlightDot: "#8ab4cc",
      titleColor: "#ffffff", textColor: "rgba(255,255,255,.75)", lineColor: "rgba(138,180,204,.15)"
    }
  },
  params: {
    title:     { type:"string", default:"",   label:"标题",        semantic:"section header above list", group:"content" },
    items:     { type:"array",  required:true, label:"列表项",      semantic:"array of strings, each is one list item", group:"content" },
    highlight: { type:"string", default:"",   label:"高亮项",       semantic:"exact string of item to highlight with glow", group:"content" },
    x:         { type:"number", default:60,   label:"X起点(px)",   group:"style", range:[0,1920], step:10 },
    y:         { type:"number", default:140,  label:"Y起点(px)",   group:"style", range:[0,1080], step:10 },
    stagger:   { type:"number", default:0.4,  label:"交错间隔(s)", semantic:"seconds between each item fading in", group:"animation", range:[0.1,2], step:0.1 },
    dotBorder:    { type:"color", default:"rgba(245,236,224,.25)", label:"点边框色", group:"color" },
    highlightDot: { type:"color", default:"#da7756", label:"高亮点颜色", group:"color" },
    titleColor:   { type:"color", default:"#f5ece0", label:"标题色", group:"color" },
    textColor:    { type:"color", default:"rgba(245,236,224,.8)", label:"文字色", group:"color" },
    lineColor:    { type:"color", default:"rgba(245,236,224,.12)", label:"连接线色", group:"color" }
  },
  ai: {
    when: "展示步骤列表、时间线、功能清单。支持高亮当前聚焦的项。",
    how: "items 传字符串数组。highlight 传其中一个字符串（精确匹配）来高亮该项。stagger 控制逐项出现的节奏。",
    example: { title:"拦截层级", items:["用户输入 prompt","Claude 解析意图","Hook 拦截判断","执行 / 拒绝","记录审计日志"], highlight:"Hook 拦截判断", x:60, y:140, stagger:0.4 },
    theme_guide: { "anthropic-warm":"暖橙色高亮", "dark-blue":"冷蓝高亮" },
    avoid: "单项不超过 60 字，否则换行影响布局。超过 8 项建议分两列（用两个 eventList）。",
    pairs_with: ["titleCard","auroraGradient","flowDiagram"]
  }
};

function ease3(p){return 1-Math.pow(1-Math.max(0,Math.min(1,p)),3)}
function fadeIn(t,start,dur){return ease3((t-start)/dur)}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

export function render(t, params, vp) {
  var p = {};
  for(var k in meta.params) p[k] = params[k]!==undefined ? params[k] : meta.params[k].default;
  var items = Array.isArray(p.items) ? p.items : [];
  var x = p.x;
  var y = p.y;
  var titleOp = fadeIn(t, 0, 0.5);
  var DOT_SIZE = 16;
  var LINE_LEFT = x + DOT_SIZE/2;
  var ITEM_LEFT = x + DOT_SIZE + 16;
  var rows = items.map(function(item, i) {
    var isHl = p.highlight && String(item) === String(p.highlight);
    var itemOp = fadeIn(t, i * p.stagger, 0.5);
    if(itemOp <= 0) return '';
    var dotBg   = isHl ? p.highlightDot : 'transparent';
    var dotBorder = isHl ? p.highlightDot : p.dotBorder;
    var glow    = isHl ? ';box-shadow:0 0 10px 3px '+p.highlightDot+'80' : '';
    var fontSize = isHl ? '16px' : '14px';
    var fontWeight = isHl ? '700' : '400';
    var color = isHl ? '#f5ece0' : p.textColor;
    return '<div style="position:relative;display:flex;align-items:center;gap:0;opacity:'+itemOp+';margin-bottom:'+(isHl?'18':'12')+'px">' +
      '<div style="width:'+DOT_SIZE+'px;height:'+DOT_SIZE+'px;border-radius:50%;flex-shrink:0;' +
        'background:'+dotBg+';border:2px solid '+dotBorder+glow+'"></div>' +
      '<div style="margin-left:16px;font:'+fontWeight+' '+fontSize+' \'SF Mono\',\'JetBrains Mono\',monospace;color:'+color+';line-height:1.5">'+esc(item)+'</div>' +
    '</div>';
  }).join('');
  var totalHeight = items.length * 34;
  return '<div style="position:absolute;left:'+x+'px;top:'+y+'px;min-width:380px">' +
    (p.title ? '<div style="font:700 13px \'SF Mono\',monospace;letter-spacing:.12em;text-transform:uppercase;color:'+p.titleColor+';opacity:'+titleOp+';margin-bottom:24px">'+esc(p.title)+'</div>' : '') +
    '<div style="position:relative">' +
      '<div style="position:absolute;left:'+(DOT_SIZE/2)+'px;top:0;bottom:0;width:2px;background:'+p.lineColor+'"></div>' +
      rows +
    '</div>' +
  '</div>';
}

export function screenshots() {
  return [
    { t: 0,   label: "标题出现" },
    { t: 0.8, label: "前两项淡入" },
    { t: 2.5, label: "全部显示含高亮" }
  ];
}

export function lint(params, vp) {
  var errors = [];
  if(!params.items || !Array.isArray(params.items) || params.items.length === 0)
    errors.push("items 不能为空。Fix: 传入字符串数组");
  if(params.highlight && Array.isArray(params.items) && !params.items.includes(params.highlight))
    errors.push("highlight 的值在 items 中找不到。Fix: highlight 必须是 items 中的某个字符串");
  return { ok: errors.length===0, errors: errors };
}
