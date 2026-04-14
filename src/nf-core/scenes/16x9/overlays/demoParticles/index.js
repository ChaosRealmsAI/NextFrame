export const meta = {
  id: "demoParticles",
  version: 1,
  ratio: "16:9",
  category: "overlays",
  label: "Demo Particle System",
  description: "Canvas2D 粒子系统，100+ 小点缓慢漂移，附近粒子之间有连线。展示 Canvas2D 渲染能力。",
  tech: "canvas2d",
  duration_hint: 7,
  loopable: true,
  z_hint: "middle",
  tags: ["particles", "canvas2d", "ambient", "demo", "animated"],
  mood: ["mysterious", "tech", "calm"],
  theme: ["tech", "space", "abstract"],
  default_theme: "cyan-web",
  themes: {
    "cyan-web":    { dotColor: "#4fc3f7", lineColor: "#4fc3f7", bgColor: "#050510", dotSize: 2.5, count: 120, speed: 0.4, connectDist: 150 },
    "green-matrix":{ dotColor: "#69f0ae", lineColor: "#69f0ae", bgColor: "#020d08", dotSize: 2, count: 140, speed: 0.3, connectDist: 130 },
    "purple-dream":{ dotColor: "#ce93d8", lineColor: "#ba68c8", bgColor: "#0d0514", dotSize: 3, count: 100, speed: 0.5, connectDist: 160 },
  },
  params: {
    dotColor:    { type: "string", default: "#4fc3f7", label: "粒子颜色", semantic: "color of individual particles", group: "color" },
    lineColor:   { type: "string", default: "#4fc3f7", label: "连线颜色", semantic: "color of connection lines between nearby particles", group: "color" },
    bgColor:     { type: "string", default: "#050510", label: "背景色", semantic: "canvas background color", group: "color" },
    dotSize:     { type: "number", default: 2.5, range: [1, 6], step: 0.5, label: "粒子大小", semantic: "radius of each particle dot in pixels", group: "style" },
    count:       { type: "number", default: 120, range: [50, 200], step: 10, label: "粒子数量", semantic: "total number of particles", group: "style" },
    speed:       { type: "number", default: 0.4, range: [0.1, 2], step: 0.1, label: "漂移速度", semantic: "particle drift speed multiplier", group: "animation" },
    connectDist: { type: "number", default: 150, range: [80, 250], step: 10, label: "连线距离", semantic: "max distance to draw connection lines (px at 1920w)", group: "style" },
  },
  ai: {
    when: "需要展示动态背景或粒子效果时，适合科技感场景",
    how: "叠加在深色背景上，start=7 dur=7s，展示 Canvas2D 能力",
    example: { dotColor: "#4fc3f7", lineColor: "#4fc3f7", bgColor: "#050510", dotSize: 2.5, count: 120, speed: 0.4, connectDist: 150 },
    theme_guide: { "cyan-web": "经典蓝白网络", "green-matrix": "绿色矩阵风", "purple-dream": "紫色梦幻" },
    avoid: "不要在亮色背景上使用；count 超过 200 可能卡顿",
    pairs_with: ["demoBg", "demoProgress"],
  },
};

// Deterministic pseudo-random — seeded
function seededRand(seed) {
  let s = seed;
  return function() {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function render(t, params, vp) {
  const { dotColor, lineColor, bgColor, dotSize, count, speed, connectDist } = params;
  const W = vp.width, H = vp.height;
  const T = t * speed;
  const scale = W / 1920;
  const cd = connectDist * scale;
  const ds = dotSize * scale;

  // Generate deterministic particle positions
  const rand = seededRand(42);
  const particles = [];
  for (let i = 0; i < count; i++) {
    const bx = rand() * W;
    const by = rand() * H;
    const vx = (rand() - 0.5) * 0.8;
    const vy = (rand() - 0.5) * 0.8;
    const phase = rand() * Math.PI * 2;
    // Position at time T
    const x = ((bx + vx * T * 60 + W * 10) % W + W) % W;
    const y = ((by + vy * T * 60 + H * 10) % H + H) % H;
    particles.push({ x, y, phase });
  }

  // Build canvas draw script
  const particlesJson = JSON.stringify(particles.map(p => [
    Math.round(p.x), Math.round(p.y)
  ]));

  return `<canvas width="${W}" height="${H}" style="position:absolute;inset:0;width:100%;height:100%;display:block" id="__pc"></canvas>
<script>(function(){
  const c=document.getElementById("__pc"),x=c.getContext("2d");
  const W=${W},H=${H},CD=${cd.toFixed(1)},DS=${ds.toFixed(1)};
  const DC="${dotColor}",LC="${lineColor}",BC="${bgColor}";
  const pts=${particlesJson};
  x.fillStyle=BC;x.fillRect(0,0,W,H);
  // draw lines
  for(let i=0;i<pts.length;i++){
    for(let j=i+1;j<pts.length;j++){
      const dx=pts[i][0]-pts[j][0],dy=pts[i][1]-pts[j][1];
      const d=Math.sqrt(dx*dx+dy*dy);
      if(d<CD){
        x.beginPath();x.moveTo(pts[i][0],pts[i][1]);x.lineTo(pts[j][0],pts[j][1]);
        x.strokeStyle=LC.replace(')',','+(1-d/CD)*0.4+')').replace('rgb','rgba').replace('#','rgba(').replace(LC,LC);
        const a=(1-d/CD)*0.35;
        x.globalAlpha=a;x.lineWidth=0.8;x.stroke();
      }
    }
  }
  x.globalAlpha=1;
  // draw dots
  x.fillStyle=DC;
  for(let i=0;i<pts.length;i++){
    x.beginPath();x.arc(pts[i][0],pts[i][1],DS,0,Math.PI*2);x.fill();
  }
  // title
  x.fillStyle="rgba(255,255,255,0.7)";x.font="bold "+Math.round(W*0.03)+"px system-ui,sans-serif";
  x.textAlign="center";x.fillText("粒子系统",W/2,Math.round(H*0.12));
  x.font=Math.round(W*0.016)+"px system-ui,sans-serif";x.fillStyle="rgba(255,255,255,0.4)";
  x.fillText("Canvas2D 渲染 — "+pts.length+" 粒子，实时连线计算",W/2,Math.round(H*0.9));
})()<\/script>`;
}

export function screenshots() {
  return [
    { t: 0, label: "初始粒子分布" },
    { t: 3, label: "漂移中" },
    { t: 6, label: "连线变化" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (params.count > 200) errors.push("count 超出范围，最大 200");
  if (params.count < 50) errors.push("count 最小 50");
  return { ok: errors.length === 0, errors };
}
