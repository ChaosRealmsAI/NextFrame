export const meta = {
  id: "flowDiagram", version: 1, ratio: "16:9", category: "data",
  label: "Flow Diagram", description: "流程图：一排圆形节点加箭头，末尾可分叉成两个节点。适合展示数据流、决策流、处理管道。",
  tech: "dom", duration_hint: 12, loopable: false, z_hint: "middle",
  tags: ["流程", "flow", "diagram", "节点", "箭头", "pipeline"],
  mood: ["technical", "structured"], theme: ["tech", "education"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": { headlineColor:"#f5ece0", quoteColor:"#d4b483", arrowColor:"rgba(245,236,224,.3)", nodeBg:"rgba(245,236,224,.05)" }
  },
  params: {
    headline:      { type:"string", default:"",  label:"大标题",       semantic:"big serif headline at top", group:"content" },
    nodes:         { type:"array",  required:true, label:"主节点列表",  semantic:"array of {icon,label,sub,color} objects", group:"content" },
    forkNodes:     { type:"array",  default:[],   label:"分叉节点",     semantic:"array of {icon,sub,color}, shown stacked at the end after fork arrow", group:"content" },
    quote:         { type:"string", default:"",   label:"底部引语",     semantic:"italic gold text at bottom", group:"content" },
    headlineDelay: { type:"number", default:0.3,  label:"标题出现(s)",  group:"animation", range:[0,5], step:0.1 },
    flowDelay:     { type:"number", default:2.5,  label:"流程出现(s)",  group:"animation", range:[0,10], step:0.1 },
    quoteDelay:    { type:"number", default:6.0,  label:"引语出现(s)",  group:"animation", range:[0,15], step:0.1 }
  },
  ai: {
    when: "展示多步流程、数据管道、决策分叉。headline 概括主题，nodes 是步骤，forkNodes 是最后分出的两条路。",
    how: "node.color 取值: 'blue'=#8ab4cc, 'orange'=#da7756, 'green'=#7ec699, 'red'=#e06c75。icon 用单个 emoji 或符号。",
    example: {
      headline:"Claude Hook 执行流程",
      nodes:[
        {icon:"✏️",label:"用户输入",sub:"prompt",color:"blue"},
        {icon:"🧠",label:"Claude 解析",sub:"意图识别",color:"blue"},
        {icon:"🪝",label:"Hook 拦截",sub:"规则匹配",color:"orange"}
      ],
      forkNodes:[
        {icon:"✅",sub:"允许执行",color:"green"},
        {icon:"🚫",sub:"拒绝操作",color:"red"}
      ],
      quote:"\"每次 AI 操作都经过人类授权的规则过滤\"",
      headlineDelay:0.3, flowDelay:2.5, quoteDelay:6.0
    },
    theme_guide: { "anthropic-warm":"暖色调，金色引语" },
    avoid: "nodes 超过 5 个会溢出屏幕。超长 label 会压缩节点宽度。",
    pairs_with: ["auroraGradient","slideChrome","eventList"]
  }
};

function ease3(p){return 1-Math.pow(1-Math.max(0,Math.min(1,p)),3)}
function fadeIn(t,start,dur){return ease3((t-start)/dur)}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

var COLOR_MAP = { blue:"#8ab4cc", orange:"#da7756", green:"#7ec699", red:"#e06c75" };
function resolveColor(c){ return COLOR_MAP[c] || c || "#8ab4cc"; }

function nodeHtml(icon, label, sub, color) {
  var c = resolveColor(color);
  return '<div style="display:flex;flex-direction:column;align-items:center;gap:10px;min-width:100px">' +
    '<div style="width:72px;height:72px;border-radius:50%;border:2px solid '+c+';background:'+c+'18;' +
      'display:flex;align-items:center;justify-content:center;font-size:28px;flex-shrink:0">' +
      esc(icon||'') +
    '</div>' +
    (label ? '<div style="font:700 13px \'SF Mono\',monospace;color:#f5ece0;text-align:center;line-height:1.3">'+esc(label)+'</div>' : '') +
    (sub   ? '<div style="font:400 11px system-ui,sans-serif;color:rgba(245,236,224,.5);text-align:center">'+esc(sub)+'</div>' : '') +
  '</div>';
}

function arrowHtml(color) {
  return '<div style="color:rgba(245,236,224,.3);font-size:22px;margin:0 4px;align-self:center">→</div>';
}

export function render(t, params, vp) {
  var p = {};
  for(var k in meta.params) p[k] = params[k]!==undefined ? params[k] : meta.params[k].default;
  var nodes = Array.isArray(p.nodes) ? p.nodes : [];
  var forkNodes = Array.isArray(p.forkNodes) ? p.forkNodes : [];
  var hlOp = fadeIn(t, p.headlineDelay, 0.7);
  var flowOp = fadeIn(t, p.flowDelay, 0.8);
  var qOp = fadeIn(t, p.quoteDelay, 0.7);

  var mainRow = nodes.map(function(n, i) {
    return (i > 0 ? arrowHtml() : '') + nodeHtml(n.icon, n.label, n.sub, n.color);
  }).join('');

  var forkHtml = '';
  if(forkNodes.length > 0) {
    var forkItems = forkNodes.map(function(fn) {
      var c = resolveColor(fn.color);
      return '<div style="display:flex;align-items:center;gap:10px;min-width:110px">' +
        '<div style="width:52px;height:52px;border-radius:50%;border:2px solid '+c+';background:'+c+'18;' +
          'display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">'+esc(fn.icon||'')+'</div>' +
        '<div style="font:400 12px system-ui,sans-serif;color:rgba(245,236,224,.7)">'+esc(fn.sub||'')+'</div>' +
      '</div>';
    }).join('<div style="height:12px"></div>');
    forkHtml = '<div style="display:flex;align-items:center;gap:8px">' +
      '<div style="color:rgba(245,236,224,.3);font-size:22px;align-self:center">→</div>' +
      '<div style="display:flex;flex-direction:column;gap:0;border-left:2px solid rgba(245,236,224,.15);padding-left:12px">' +
        forkItems +
      '</div>' +
    '</div>';
  }

  return '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px">' +
    (p.headline ? '<div style="font:700 38px Georgia,\'Noto Serif SC\',serif;color:#f5ece0;text-align:center;margin-bottom:52px;opacity:'+hlOp+'">'+esc(p.headline)+'</div>' : '') +
    '<div style="display:flex;align-items:center;gap:4px;opacity:'+flowOp+'">' +
      mainRow + forkHtml +
    '</div>' +
    (p.quote ? '<div style="font:italic 400 18px Georgia,serif;color:#d4b483;margin-top:48px;text-align:center;max-width:700px;opacity:'+qOp+'">'+esc(p.quote)+'</div>' : '') +
  '</div>';
}

export function screenshots() {
  return [
    { t: 0.5, label: "标题淡入" },
    { t: 3.0, label: "流程节点出现" },
    { t: 6.5, label: "引语出现，全画面" }
  ];
}

export function lint(params, vp) {
  var errors = [];
  if(!params.nodes || !Array.isArray(params.nodes) || params.nodes.length === 0)
    errors.push("nodes 不能为空。Fix: 传入至少一个 {icon,label,sub,color} 对象");
  if(params.nodes && params.nodes.length > 5)
    errors.push("nodes 超过 5 个会溢出屏幕。Fix: 精简节点或分成两个 flowDiagram");
  return { ok: errors.length===0, errors: errors };
}
