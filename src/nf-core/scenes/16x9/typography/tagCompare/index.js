export const meta = {
  id: "tagCompare", version: 1, ratio: "16:9", category: "typography",
  label: "Tag Compare", description: "两个并排的对比标签，中间有 vs 字样。适合用于概念对比、新旧对比、工具对比。",
  tech: "dom", duration_hint: 10, loopable: false, z_hint: "middle",
  tags: ["对比", "compare", "tag", "pill", "vs"],
  mood: ["informative", "focused"], theme: ["tech", "education"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": {
      leftBg: "rgba(126,198,153,.15)", leftBorder: "#7ec699", leftColor: "#7ec699",
      rightBg: "rgba(218,119,86,.15)", rightBorder: "#da7756", rightColor: "#da7756"
    },
    "dark-blue": {
      leftBg: "rgba(138,180,204,.15)", leftBorder: "#8ab4cc", leftColor: "#8ab4cc",
      rightBg: "rgba(245,236,224,.1)", rightBorder: "rgba(245,236,224,.5)", rightColor: "#f5ece0"
    }
  },
  params: {
    left:        { type:"string", required:true,  label:"左侧标签文字",  semantic:"left tag text", group:"content" },
    right:       { type:"string", required:true,  label:"右侧标签文字",  semantic:"right tag text", group:"content" },
    x:           { type:"number", default:700,    label:"X起点(px)",    semantic:"horizontal center anchor", group:"style", range:[0,1920], step:10 },
    y:           { type:"number", default:680,    label:"Y位置(px)",    semantic:"vertical position from top", group:"style", range:[0,1080], step:10 },
    leftBg:      { type:"color", default:"rgba(126,198,153,.15)", label:"左背景色", group:"color" },
    leftBorder:  { type:"color", default:"#7ec699", label:"左边框色", group:"color" },
    leftColor:   { type:"color", default:"#7ec699", label:"左文字色", group:"color" },
    rightBg:     { type:"color", default:"rgba(218,119,86,.15)", label:"右背景色", group:"color" },
    rightBorder: { type:"color", default:"#da7756", label:"右边框色", group:"color" },
    rightColor:  { type:"color", default:"#da7756", label:"右文字色", group:"color" },
    enterDelay:  { type:"number", default:0, label:"出现延迟(s)", semantic:"fade-in start time", group:"animation", range:[0,10], step:0.1 }
  },
  ai: {
    when: "需要对比两个概念、工具或方案时。放在主标题下方作为视觉补充。",
    how: "left 和 right 都支持任意文字，建议简短（10字以内）。通常放在 titleCard 正下方（y=680）。",
    example: { left:"Git Hook 拦 commit", right:"Claude Hook 拦 AI 操作", x:700, y:680, enterDelay:2.5 },
    theme_guide: { "anthropic-warm":"绿色左、橙色右", "dark-blue":"蓝白色调" },
    avoid: "不适合超长文字，标签会截断。长文字用 titleCard 的 subtitle。",
    pairs_with: ["titleCard","auroraGradient","slideChrome"]
  }
};

function ease3(p){return 1-Math.pow(1-Math.max(0,Math.min(1,p)),3)}
function fadeIn(t,start,dur){return ease3((t-start)/dur)}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

export function render(t, params, vp) {
  var p = {};
  for(var k in meta.params) p[k] = params[k]!==undefined ? params[k] : meta.params[k].default;
  var op = fadeIn(t, p.enterDelay, 0.5);
  if(op <= 0) return '';
  var x = p.x;
  var y = p.y;
  var tagStyle = function(bg, border, color) {
    return 'display:inline-flex;align-items:center;padding:8px 20px;border-radius:999px;' +
      'background:'+bg+';border:1.5px solid '+border+';' +
      'font:700 15px \'SF Mono\',\'JetBrains Mono\',monospace;color:'+color+';' +
      'white-space:nowrap;letter-spacing:.04em';
  };
  return '<div style="position:absolute;left:'+x+'px;top:'+y+'px;display:flex;align-items:center;gap:16px;opacity:'+op+'">' +
    '<span style="'+tagStyle(p.leftBg, p.leftBorder, p.leftColor)+'">'+esc(p.left)+'</span>' +
    '<span style="font:italic 700 18px Georgia,serif;color:rgba(245,236,224,.45);flex-shrink:0">vs</span>' +
    '<span style="'+tagStyle(p.rightBg, p.rightBorder, p.rightColor)+'">'+esc(p.right)+'</span>' +
  '</div>';
}

export function screenshots() {
  return [
    { t: 0,   label: "初始（全透明）" },
    { t: 0.3, label: "淡入中" },
    { t: 1,   label: "完全显示" }
  ];
}

export function lint(params, vp) {
  var errors = [];
  if(!params.left)  errors.push("left 不能为空。Fix: 传入左侧标签文字");
  if(!params.right) errors.push("right 不能为空。Fix: 传入右侧标签文字");
  return { ok: errors.length===0, errors: errors };
}
