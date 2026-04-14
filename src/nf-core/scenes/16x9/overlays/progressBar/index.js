export const meta = {
  id: "progressBar16x9", version: 1, ratio: "16:9", category: "overlays",
  label: "Progress Bar", description: "底部细进度条。调用方每帧传入 progress(0-1)，无动画逻辑，视觉即时更新。",
  tech: "dom", duration_hint: 0, loopable: true, z_hint: "top",
  tags: ["进度条", "progress", "bar", "overlay", "底部"],
  mood: ["neutral"], theme: ["tech", "education", "vlog"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": { color:"#da7756", trackColor:"rgba(245,236,224,.08)" },
    "dark-minimal": { color:"#8ab4cc", trackColor:"rgba(255,255,255,.08)" },
    "signal-green": { color:"#7ec699", trackColor:"rgba(126,198,153,.18)" }
  },
  params: {
    progress:     { type:"number", required:true, default:0.35, label:"进度 0-1", semantic:"current progress fraction, 0=empty 1=full", group:"content", range:[0,1], step:0.01 },
    color:        { type:"color",  default:"#da7756",          label:"进度条颜色",  group:"color" },
    trackColor:   { type:"color",  default:"rgba(245,236,224,.08)", label:"轨道颜色", group:"color" },
    height:       { type:"number", default:4,                  label:"高度(px)",    group:"style", range:[1,20], step:1 },
    y:            { type:"number", default:50,                 label:"距底部(px)",  group:"style", range:[0,200], step:5 },
    borderRadius: { type:"number", default:2,                  label:"圆角(px)",    group:"style", range:[0,10], step:1 }
  },
  ai: {
    when: "显示视频整体播放进度或章节进度。调用方计算 progress = currentTime / totalDuration 传入。",
    how: "progress 是 0-1 的小数。0 = 空，1 = 满。每帧由调用方更新，组件本身无时间逻辑。",
    example: { progress:0.35, color:"#da7756", height:4, y:50 },
    theme_guide: { "anthropic-warm":"橙色进度条 + 极淡轨道", "dark-minimal":"蓝色极简", "signal-green":"绿色强调" },
    avoid: "height > 8 会显得突兀，建议 3-6px。不要用于倒计时（那是调用方的逻辑）。",
    pairs_with: ["subtitleBar","slideChrome","auroraGradient"]
  }
};

export function render(t, params, vp) {
  const p = {};
  for (const k in meta.params) p[k] = params[k] !== undefined ? params[k] : meta.params[k].default;
  const progress = Math.max(0, Math.min(1, p.progress || 0));
  const h = p.height;
  const r = p.borderRadius;
  const y = p.y;
  const fillW = (progress * 100).toFixed(3) + '%';
  return '<div style="position:absolute;bottom:'+y+'px;left:0;right:0;width:'+vp.width+'px;height:'+h+'px;border-radius:'+r+'px;background:'+p.trackColor+';overflow:hidden">' +
    '<div style="height:100%;width:'+fillW+';background:'+p.color+';border-radius:'+r+'px"></div>' +
  '</div>';
}

export function screenshots() {
  return [
    { t: 0,   label: "进度 0%（调用方传 progress:0）" },
    { t: 0,   label: "进度 35%（调用方传 progress:0.35）" },
    { t: 0,   label: "进度 100%（调用方传 progress:1）" }
  ];
}

export function lint(params, vp) {
  const errors = [];
  if(params.progress === undefined || params.progress === null)
    errors.push("progress 不能为空。Fix: 传入 0-1 之间的小数");
  if(params.progress !== undefined && (params.progress < 0 || params.progress > 1))
    errors.push("progress 必须在 0-1 之间。Fix: 当前值 "+params.progress+" 超出范围");
  return { ok: errors.length===0, errors: errors };
}
