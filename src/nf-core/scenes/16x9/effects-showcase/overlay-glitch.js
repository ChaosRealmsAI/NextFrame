// scenes/16x9/effects-showcase/overlay-glitch.js
//
// glitch — Canvas 2D 多通道 RGB 位移 + 扫描线 + 数字噪声块 = VHS 故障美学
// 真·glitch — 不是 CSS clip-path 那种假货，是像素级 RGB 分离 + 随机切片偏移。

export default {
  id: "glitch",
  name: "glitch",
  version: "1.0.0",

  ratio: "16:9",
  theme: "effects-showcase",
  role: "overlay",

  description: "Canvas 2D RGB 通道分离 + 横向切片随机位移 + 扫描线 = VHS 故障 / 赛博 glitch 覆盖层",
  duration_hint: null,

  type: "dom",
  frame_pure: false,
  assets: [],

  intent: `普通的 glitch 是 CSS clip-path 切几个矩形偏移 — 一眼假。真 glitch 三要素：(1) RGB 通道分离 — 把同一个文字/图形以 cyan / magenta 偏移 4-12 像素绘制三次，模拟旧 CRT 色散；(2) 横向切片随机位移 — 把画面切成 8-14 个水平条，每条按伪随机偏移 0-30px，带「时间窗口」（大部分时间偏移 0，只在 t 的某些区段触发）；(3) 扫描线 + 数字噪声 — 1px 横线每隔 4px 填半透黑，再撒少量 cyan/magenta 噪点。t-driven 节奏：故障不是常驻的，每 2.5s 触发一次「故障爆发」（持续 0.3s 高强度），其他时间只剩淡扫描线 — 这种「断断续续」才像真故障，常驻反而显得做作。情绪节点：转场、错误提示、Hook 砸脸前的预热闪动。覆盖层透明，不挡内容。`,

  when_to_use: [
    "转场前的故障预警（0.3s 短脉冲）",
    "Hook 砸脸前营造紧张感",
    "讲「错误 / 失控 / 黑客 / 反乌托邦」议题",
  ],

  when_not_to_use: [
    "需要稳定阅读的镜头（持续故障会把字搅烂）",
    "整段视频铺满（观众视觉疲劳）",
  ],

  limitations: [
    "Canvas 全屏覆盖，比 SVG 略吃 GPU",
    "故障节奏写死 2.5s 周期",
  ],

  inspired_by: "Mr. Robot 片头 + Cyberpunk 2077 UI + VHS Glitch effects 教程",
  used_in: [],

  requires: [],
  pairs_well_with: ["text-neonGlow", "data-bigStat", "bg-liquidNoise"],
  conflicts_with: [],
  alternatives: [],

  visual_weight: "medium",
  z_layer: "top",
  mood: ["chaotic", "cyberpunk", "tension", "broken"],

  tags: ["overlay", "glitch", "vhs", "cyberpunk", "rgb-split", "effects-showcase"],

  complexity: "complex",
  performance: { cost: "medium", notes: "全屏 canvas 切片 + 噪点；1080p 流畅" },
  status: "stable",
  changelog: [
    { version: "1.0.0", date: "2026-04-15", change: "initial — true canvas glitch with RGB split + slice offset + scanlines" },
  ],

  params: {
    intensity: {
      type: "number",
      default: 1.0,
      semantic: "故障强度 0~1，1=完全爆发，0.3=轻微",
    },
  },

  enter: null,
  exit: null,

  render(host, t, params, vp) {
    const W = vp.width;
    const H = vp.height;
    const intensity = Math.max(0, Math.min(1, Number(params.intensity) ?? 1.0));
    const ctx = getCanvas2D(host, vp);

    ctx.clearRect(0, 0, W, H);

    // 故障节奏：每 2.5s 一次爆发，持续 0.3s
    const cycleLen = 2.5;
    const burstDur = 0.3;
    const cyclePos = t % cycleLen;
    const inBurst = cyclePos < burstDur;
    const burstP = inBurst ? cyclePos / burstDur : 0;
    // 爆发内强度曲线：sin pulse
    const burstStrength = inBurst ? Math.sin(burstP * Math.PI) * intensity : 0;

    // 1. 横向切片 + RGB 分离（仅爆发内强烈，常时微弱）
    const sliceCount = 12;
    const sliceH = H / sliceCount;
    const baseDrift = 0.15 * intensity; // 常驻轻微漂移

    for (let i = 0; i < sliceCount; i++) {
      // 伪随机偏移
      const r1 = Math.sin(i * 12.9 + Math.floor(t * 14) * 1.7) * 0.5 + 0.5;
      const r2 = Math.sin(i * 7.3 + Math.floor(t * 14) * 2.3) * 0.5 + 0.5;
      // 切片是否被触发
      const triggered = r1 > 0.7;
      const offset = triggered ? (r2 - 0.5) * 30 * burstStrength : (r2 - 0.5) * 2 * baseDrift;
      if (Math.abs(offset) < 0.3) continue;

      const y = i * sliceH;
      // 画 cyan + magenta 两条偏移色带
      const cyanOff = offset;
      const magOff = -offset * 0.7;

      // cyan 切片
      ctx.fillStyle = `rgba(0, 240, 255, ${(0.18 + 0.4 * burstStrength).toFixed(3)})`;
      ctx.fillRect(cyanOff, y, W, sliceH * 0.85);

      ctx.fillStyle = `rgba(255, 43, 214, ${(0.18 + 0.4 * burstStrength).toFixed(3)})`;
      ctx.fillRect(magOff, y, W, sliceH * 0.85);

      // 切片间黑缝（增加「胶带剪辑」感）
      if (triggered) {
        ctx.fillStyle = `rgba(0, 0, 0, ${(0.5 * burstStrength).toFixed(3)})`;
        ctx.fillRect(0, y + sliceH * 0.85, W, sliceH * 0.15);
      }
    }

    // 2. 扫描线（常驻，1px 黑 / 3px 透明，营造 CRT 感）
    ctx.fillStyle = `rgba(0, 0, 0, ${(0.12 * intensity).toFixed(3)})`;
    for (let y = 0; y < H; y += 4) {
      ctx.fillRect(0, y, W, 1);
    }

    // 3. 数字噪点（爆发期密集）
    const noiseCount = inBurst ? Math.floor(180 * burstStrength) : Math.floor(20 * intensity);
    for (let i = 0; i < noiseCount; i++) {
      const nx = Math.sin(i * 92.1 + t * 31) * 0.5 + 0.5;
      const ny = Math.sin(i * 47.5 + t * 19) * 0.5 + 0.5;
      const x = nx * W;
      const y = ny * H;
      const w = 1 + Math.sin(i) * 2;
      const isCyan = i % 2 === 0;
      ctx.fillStyle = isCyan
        ? `rgba(0, 240, 255, ${(0.4 + 0.5 * burstStrength).toFixed(3)})`
        : `rgba(255, 43, 214, ${(0.4 + 0.5 * burstStrength).toFixed(3)})`;
      ctx.fillRect(x, y, Math.max(1, Math.abs(w)), 1);
    }

    // 4. 大故障横条（爆发巅峰，1-2 条粗带）
    if (burstStrength > 0.5) {
      const bandCount = Math.floor(burstStrength * 3) + 1;
      for (let b = 0; b < bandCount; b++) {
        const by = (Math.sin(b * 33 + Math.floor(t * 14)) * 0.5 + 0.5) * H;
        const bh = 4 + Math.abs(Math.sin(b + t * 7)) * 16;
        const grad = ctx.createLinearGradient(0, by, W, by);
        grad.addColorStop(0, "rgba(0, 240, 255, 0)");
        grad.addColorStop(0.3, `rgba(0, 240, 255, ${(0.5 * burstStrength).toFixed(3)})`);
        grad.addColorStop(0.7, `rgba(255, 43, 214, ${(0.5 * burstStrength).toFixed(3)})`);
        grad.addColorStop(1, "rgba(255, 43, 214, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, by, W, bh);
      }
    }

    // 5. 角落赛博文字（mono 风格 LED 数字）
    ctx.fillStyle = `rgba(0, 240, 255, ${(0.55 + 0.3 * burstStrength).toFixed(3)})`;
    ctx.font = "16px 'SF Mono', Consolas, monospace";
    const errCode = inBurst ? `0x${Math.floor(burstP * 65535).toString(16).padStart(4, "0").toUpperCase()}` : "0x0000";
    ctx.fillText(`SIGNAL//ERR ${errCode}`, 32, H - 32);
    ctx.textAlign = "right";
    ctx.fillText(`T=${t.toFixed(2)}s  GLITCH=${(burstStrength * 100).toFixed(0)}%`, W - 32, H - 32);
    ctx.textAlign = "left";
  },

  describe(t, params, vp) {
    const cycleLen = 2.5;
    const burstDur = 0.3;
    const cyclePos = t % cycleLen;
    const inBurst = cyclePos < burstDur;
    return {
      sceneId: "glitch",
      phase: inBurst ? "burst" : "idle",
      progress: 1,
      visible: true,
      params,
      elements: [
        { type: "rgb-split", role: "glitch-channel" },
        { type: "scanlines", role: "crt-overlay" },
        { type: "noise-pixels", role: "static" },
        { type: "burst-band", role: "glitch-bar", active: inBurst },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      intensity: 1.0,
    };
  },
};

function getCanvas2D(host, vp) {
  host.innerHTML = `<canvas width="${vp.width}" height="${vp.height}" style="position:absolute;inset:0;width:100%;height:100%;display:block"></canvas>`;
  const canvas = host.querySelector("canvas");
  if (!canvas) throw new Error("Internal: glitch canvas mount failed. Fix: host must provide querySelector('canvas').");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Internal: glitch 2D context unavailable. Fix: run in a canvas-capable environment.");
  return ctx;
}
