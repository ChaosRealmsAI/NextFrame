export const meta = {
  id: "flowDiagram", version: 2, ratio: "16:9", category: "data",
  label: "Flow Diagram", description: "流程图：一排圆形节点加箭头，末尾可分叉。主节点用圆形（短文字/emoji），分叉节点用药丸标签（适合长文字如 PASS/BLOCK）。",
  tech: "dom", duration_hint: 12, loopable: false, z_hint: "middle",
  tags: ["流程", "flow", "diagram", "节点", "箭头", "pipeline"],
  mood: ["technical", "structured"], theme: ["tech", "education"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": {},
    "dark-blue": {},
    "minimal": {}
  },
  params: {
    headline:      { type:"string", default:"",  label:"大标题",       semantic:"big serif headline, supports inline HTML for accent", group:"content" },
    nodes:         { type:"array",  required:true, label:"主节点列表",  semantic:"array of {icon,label,sub,color}. icon should be 1-2 chars or emoji", group:"content" },
    forkNodes:     { type:"array",  default:[],   label:"分叉节点",     semantic:"array of {label,sub,color}. label can be longer text like PASS/BLOCK", group:"content" },
    quote:         { type:"string", default:"",   label:"底部引语",     semantic:"italic gold text, supports inline HTML", group:"content" },
    headlineDelay: { type:"number", default:0.3,  label:"标题出现(s)",  group:"animation", range:[0,5], step:0.1 },
    flowDelay:     { type:"number", default:2.5,  label:"流程出现(s)",  group:"animation", range:[0,10], step:0.1 },
    quoteDelay:    { type:"number", default:6.0,  label:"引语出现(s)",  group:"animation", range:[0,15], step:0.1 }
  },
  ai: {
    when: "展示多步流程、决策分叉。主节点用短 icon（emoji/1-2字母），分叉节点用 label（可长文字）。",
    how: "color: 'blue'=#8ab4cc, 'orange'=#da7756, 'green'=#7ec699, 'red'=#e06c75。",
    example: {
      headline:'给 AI 安了一个<span style="color:#da7756">安检员</span>',
      nodes:[
        {icon:"AI",label:"AI 请求",sub:"要执行操作",color:"blue"},
        {icon:"H",label:"Hook 安检",sub:"脚本检查",color:"orange"}
      ],
      forkNodes:[
        {label:"PASS",sub:"放行执行",color:"green"},
        {label:"BLOCK",sub:"拦截拒绝",color:"red"}
      ],
      quote:"每次动手之前，安检员先过一遍——该拦的拦，该放行的放行"
    },
    theme_guide: { "anthropic-warm":"暖色调，金色引语", "dark-blue":"冷蓝", "minimal":"极简" },
    avoid: "nodes 超过 4 个会挤。icon 用 emoji 或 1-2 个字母，不要用长单词。",
    pairs_with: ["auroraGradient","slideChrome","subtitleBar"]
  }
};

function ease3(p){return 1-Math.pow(1-Math.max(0,Math.min(1,p)),3)}
function fadeIn(t,start,dur){return ease3((t-start)/dur)}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

var COLOR_MAP = { blue:"#8ab4cc", orange:"#da7756", green:"#7ec699", red:"#e06c75" };
function rc(c){ return COLOR_MAP[c] || c || "#8ab4cc"; }

// 主节点：圆形，icon 居中（auto font-size），下方 label + sub
function nodeCircle(icon, label, sub, color) {
  var c = rc(color);
  var iconLen = (icon||'').length;
  var fs = iconLen <= 2 ? 20 : iconLen <= 4 ? 14 : 11;
  return '<div style="display:flex;flex-direction:column;align-items:center;gap:8px;min-width:90px">' +
    '<div style="width:72px;height:72px;border-radius:50%;border:2px solid '+c+';background:'+c+'15;' +
      'display:flex;align-items:center;justify-content:center;font:800 '+fs+'px \'SF Mono\',monospace;color:'+c+';flex-shrink:0;letter-spacing:.02em">' +
      esc(icon||'') +
    '</div>' +
    (label ? '<div style="font:600 14px system-ui,sans-serif;color:#f5ece0;text-align:center">'+esc(label)+'</div>' : '') +
    (sub   ? '<div style="font:400 12px \'SF Mono\',monospace;color:rgba(245,236,224,.45);text-align:center">'+esc(sub)+'</div>' : '') +
  '</div>';
}

// 箭头
function arrow() {
  return '<svg viewBox="0 0 60 24" style="width:60px;flex-shrink:0;margin:0 4px;align-self:center;margin-bottom:30px">' +
    '<line x1="4" y1="12" x2="48" y2="12" stroke="rgba(245,236,224,.25)" stroke-width="2"/>' +
    '<polygon points="46,6 58,12 46,18" fill="rgba(245,236,224,.25)"/>' +
  '</svg>';
}

// 分叉节点：药丸标签，label + sub 横排
function forkPill(label, sub, color) {
  var c = rc(color);
  return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0">' +
    '<div style="padding:6px 18px;border-radius:20px;border:2px solid '+c+';background:'+c+'12;' +
      'font:700 14px \'SF Mono\',monospace;color:'+c+';letter-spacing:.05em;white-space:nowrap">' +
      esc(label||'') +
    '</div>' +
    (sub ? '<div style="font:400 13px system-ui,sans-serif;color:rgba(245,236,224,.6)">'+esc(sub)+'</div>' : '') +
  '</div>';
}

export function render(t, params, vp) {
  var p = {};
  for(var k in meta.params) p[k] = params[k]!==undefined ? params[k] : meta.params[k].default;
  var nodes = Array.isArray(p.nodes) ? p.nodes : [];
  var forkNodes = Array.isArray(p.forkNodes) ? p.forkNodes : [];
  var hlOp = fadeIn(t, p.headlineDelay, 0.7);
  var flowOp = fadeIn(t, p.flowDelay, 0.8);
  var qOp = fadeIn(t, p.quoteDelay, 0.7);

  // Main row: circle nodes with arrows
  var mainRow = nodes.map(function(n, i) {
    return (i > 0 ? arrow() : '') + nodeCircle(n.icon, n.label, n.sub, n.color);
  }).join('');

  // Fork: arrow + stacked pill tags
  var forkHtml = '';
  if(forkNodes.length > 0) {
    var pills = forkNodes.map(function(fn) {
      return forkPill(fn.label||fn.icon||'', fn.sub, fn.color);
    }).join('');
    forkHtml = '<div style="display:flex;align-items:center">' +
      arrow() +
      '<div style="display:flex;flex-direction:column;gap:4px">' + pills + '</div>' +
    '</div>';
  }

  return '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;padding:80px 60px">' +
    (p.headline ? '<div style="font:700 42px Georgia,\'Noto Serif SC\',serif;color:#f5ece0;text-align:center;line-height:1.3;opacity:'+hlOp+'">'+(p.headline)+'</div>' : '') +
    '<div style="display:flex;align-items:center;opacity:'+flowOp+'">' +
      mainRow + forkHtml +
    '</div>' +
    (p.quote ? '<div style="font:italic 20px Georgia,\'Noto Serif SC\',serif;color:#d4b483;text-align:center;max-width:700px;line-height:1.5;opacity:'+qOp+'">"'+(p.quote)+'"</div>' : '') +
  '</div>';
}

export function screenshots() {
  return [
    { t: 0.5, label: "标题淡入" },
    { t: 3.0, label: "流程节点出现" },
    { t: 6.5, label: "引语出现" }
  ];
}

export function lint(params, vp) {
  var errors = [];
  if(!params.nodes || !Array.isArray(params.nodes) || params.nodes.length === 0)
    errors.push("nodes 不能为空。Fix: 传入至少一个 {icon,label,sub,color} 对象");
  if(params.nodes && params.nodes.length > 4)
    errors.push("nodes 超过 4 个会溢出。Fix: 精简到 4 个以内");
  if(params.nodes) {
    params.nodes.forEach(function(n,i) {
      if(n.icon && n.icon.length > 4) errors.push("nodes["+i+"].icon '"+n.icon+"' 超过 4 字符会溢出圆圈。Fix: 用 1-2 字符或 emoji");
    });
  }
  return { ok: errors.length===0, errors: errors };
}
