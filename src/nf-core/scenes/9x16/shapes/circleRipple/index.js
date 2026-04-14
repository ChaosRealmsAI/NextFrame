export const meta = {
  id: "circleRipple",
  ratio: "9:16",
  category: "shapes",
  label: "Circle Ripple",
  description: "从中心扩散的同心圆波纹",
  tech: "canvas2d",
  duration_hint: 6,
  loopable: true,
  tags: ["circle", "ripple", "wave", "ambient", "pulse", "rhythm"],
  mood: ["meditative", "rhythmic", "minimal"],
  theme: ["abstract", "tech", "music"],
  z_hint: "bottom",

  default_theme: "teal-spectrum",
  themes: {
    "teal-spectrum":  { hueStart: 185, hueSpan: 180, ringCount: 9, interval: 0.26, thickness: 0.012 },
    "red-pulse":      { hueStart: 350, hueSpan: 40,  ringCount: 6, interval: 0.35, thickness: 0.015 },
    "rainbow-wide":   { hueStart: 0,   hueSpan: 300, ringCount: 12, interval: 0.2,  thickness: 0.008 },
    "mono-white":     { hueStart: 0,   hueSpan: 0,   ringCount: 7, interval: 0.3,  thickness: 0.01 },
    "violet-dream":   { hueStart: 260, hueSpan: 60,  ringCount: 10, interval: 0.22, thickness: 0.014 },
  },

  params: {
    hueStart:  { type: "number", default: 185, range: [0, 360], step: 1, label: "起始色相", semantic: "first ring hue", group: "color" },
    hueSpan:   { type: "number", default: 180, range: [30, 300], step: 5, label: "色相跨度", semantic: "hue range across rings", group: "color" },
    ringCount: { type: "number", default: 9, range: [4, 16], step: 1, label: "环数", semantic: "max concurrent rings", group: "shape" },
    interval:  { type: "number", default: 0.26, range: [0.08, 1], step: 0.02, label: "生成间隔(s)", semantic: "time between new rings", group: "animation" },
    lifespan:  { type: "number", default: 2.1, range: [0.5, 6], step: 0.1, label: "存活时间(s)", semantic: "ring lifetime before fade", group: "animation" },
    thickness: { type: "number", default: 0.012, range: [0.004, 0.03], step: 0.001, label: "环宽", semantic: "ring thickness as ratio of min dimension", group: "shape" },
  },
  ai: {
    when: "需要节奏感/脉冲感/呼吸感的装饰背景。适合：等待画面、转场前后、音乐节奏可视化。",
    how: "放在底层或中层。hueStart+hueSpan 控制色彩范围，interval 控制节奏快慢。",
    example: { hueStart: 185, hueSpan: 180, ringCount: 9 },
    theme_guide: "teal-spectrum=蓝绿光谱, red-pulse=红色脉冲, rainbow-wide=彩虹, mono-white=白色极简, violet-dream=紫色梦幻",
    avoid: "不适合需要强烈视觉焦点的场景。hueSpan=0 时所有环同色。",
    pairs_with: ["kineticHeadline", "lowerThirdVelvet"],
  },
};

export function render(t, params, vp) {
  const { hueStart, hueSpan, ringCount, interval, lifespan, thickness } = params;
  const W = vp.width, H = vp.height;
  const minDim = Math.min(W, H);
  const maxR = minDim * 0.45;
  const lineW = minDim * thickness;

  return `<canvas width="${W}" height="${H}" style="width:100%;height:100%;display:block" id="__sc"></canvas>
<script>(function(){
  const c=document.getElementById("__sc"),x=c.getContext("2d"),W=${W},H=${H},t=${t};
  const hS=${hueStart},hSpan=${hueSpan},rc=${ringCount},iv=${interval},ls=${lifespan},lw=${lineW},mR=${maxR};
  x.fillStyle="#0a0a12";x.fillRect(0,0,W,H);
  const cx=W/2,cy=H/2;
  for(let i=0;i<rc;i++){
    let age=(t-i*iv)%((rc)*iv);
    if(age<0) age+=rc*iv;
    const p=age/ls;
    if(p>1||p<0) continue;
    const ease=p*(2-p);
    const r=ease*mR;
    const alpha=1-p;
    const hue=hS+(hSpan*i/rc)%360;
    x.beginPath();
    x.arc(cx,cy,Math.max(1,r),0,Math.PI*2);
    x.strokeStyle="hsla("+hue+",70%,60%,"+alpha+")";
    x.lineWidth=lw*(1-p*0.5);
    x.stroke();
  }
})()<\/script>`;
}

export function screenshots() {
  return [
    { t: 0.5, label: "第一个环" },
    { t: 2, label: "多个环扩散" },
    { t: 5, label: "稳定状态" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (params.ringCount > 16) errors.push("ringCount 超过 16 上限。Fix: 设为 16 以内");
  if (params.lifespan < params.interval * 2) errors.push("lifespan 太短，环还没展开就消失了。Fix: lifespan 至少是 interval 的 2 倍");
  return { ok: errors.length === 0, errors };
}
