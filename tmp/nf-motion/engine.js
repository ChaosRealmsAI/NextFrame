// ─────────────────────────────────────────────────────────────
// NF-Motion · frame-pure 语义动画引擎（POC，~200 行）
// 核心契约：render(host, t, motion) 是纯函数 — 相同 t 相同输入 → 相同输出
// ─────────────────────────────────────────────────────────────

// ── Easing 函数 ────────────────────────────────────────────
export const EASE = {
  linear:       t => t,
  in:           t => t * t,
  out:          t => 1 - (1 - t) ** 2,
  inOut:        t => t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2,
  outBack:      t => { const c = 1.70158; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2; },
  outElastic:   t => {
    const c = 2 * Math.PI / 3;
    return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * c) + 1;
  },
  outBounce: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1/d) return n*t*t;
    if (t < 2/d) return n*(t-=1.5/d)*t + .75;
    if (t < 2.5/d) return n*(t-=2.25/d)*t + .9375;
    return n*(t-=2.625/d)*t + .984375;
  }
};

// ── Track 插值：[[t, value, ease?], ...] → value at t ──────
export function interp(track, t) {
  if (!Array.isArray(track) || track.length === 0) return 0;
  if (t <= track[0][0]) return track[0][1];
  if (t >= track[track.length - 1][0]) return track[track.length - 1][1];
  for (let i = 0; i < track.length - 1; i++) {
    const [t0, v0] = track[i];
    const [t1, v1, ease = "inOut"] = track[i + 1];
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / (t1 - t0);
      const e = EASE[ease] || EASE.inOut;
      const k = e(u);
      // scalar or 2-tuple
      if (Array.isArray(v0)) {
        return v0.map((a, j) => a + (v1[j] - a) * k);
      }
      return v0 + (v1 - v0) * k;
    }
  }
  return track[track.length - 1][1];
}

// ── Behavior 预设：语义 → 原始 tracks 展开 ─────────────────
// 这是 NF-Motion 相对 Lottie 的杀手锏：AI 说"impact"，引擎自动出物理对的 squash/stretch
export const BEHAVIORS = {
  // 点赞级弹跳：anticipation → squash → stretch → overshoot → settle
  impact(startAt = 0, dur = 1.5) {
    const s = startAt;
    return {
      opacity: [[s, 0], [s + .1, 1, "out"]],
      scale: [
        [s,         [0, 0]],
        [s + 0.20,  [70, 70],   "out"],      // anticipation
        [s + 0.33,  [85, 55],   "inOut"],    // squash — 宽>高（蓄力）
        [s + 0.60,  [115, 130], "outBack"],  // stretch — 高>宽（弹出）
        [s + 0.87,  [103, 97],  "inOut"],    // overshoot 回弹
        [s + 1.13,  [98, 102],  "inOut"],    // 二次微抖
        [s + 1.46,  [100, 100], "out"]       // settle
      ]
    };
  },
  // 淡入+上浮
  fadeUp(startAt = 0, dur = .6, rise = 20) {
    return {
      opacity: [[startAt, 0], [startAt + dur * .5, 1, "out"]],
      offset: [[startAt, [0, rise]], [startAt + dur, [0, 0], "outBack"]]
    };
  }
};

// ── 形状渲染器：生成 SVG element ──────────────────────────
export const SHAPES = {
  heart(size) {
    const s = size / 100;
    return `<path d="M 0,-15
      C 0,-40 -30,-55 -55,-45
      C -85,-30 -90,10 -60,35
      C -30,55 -5,65 0,75
      C 5,65 30,55 60,35
      C 90,10 85,-30 55,-45
      C 30,-55 0,-40 0,-15 Z"
      transform="scale(${s})" />`;
  },
  sparkle(size) {
    const s = size / 10;
    return `<path d="M 0,-10 L 2,-2 L 10,0 L 2,2 L 0,10 L -2,2 L -10,0 L -2,-2 Z"
      transform="scale(${s})" />`;
  },
  circle() {
    return `<circle cx="0" cy="0" r="50" />`;
  },
  ring() {
    // vector-effect 保证 stroke 不随 scale 变粗细；硬编码 r=50 作为单位圆
    return `<circle cx="0" cy="0" r="50" fill="none" stroke-width="4" vector-effect="non-scaling-stroke" />`;
  }
};

// ── 特殊 layer 类型展开：ripple / burst ────────────────────
function expandLayer(layer) {
  // ripple 环波：一层 ring，scale 0→maxRadius/50，opacity 1→0
  if (layer.type === "ripple") {
    const s = layer.startAt || 0;
    const dur = layer.duration || 0.9;
    // maxRadius/50 是倍数；乘 100 转成 scale 百分比（render 内部 /100 当作比例）
    const scaleMax = (layer.maxRadius || 200) / 50 * 100;
    return [{
      type: "shape", shape: "ring", at: layer.at,
      stroke: layer.color || "#ff6c8f",
      tracks: {
        scale:   [[s, [40, 40]], [s + dur, [scaleMax, scaleMax], "out"]],
        opacity: [[s, 0.8], [s + dur, 0, "in"]]
      }
    }];
  }
  // burst 粒子迸发：N 份 sparkle 沿圆周向外飞
  if (layer.type === "burst") {
    const s = layer.startAt || 0;
    const dur = layer.duration || 0.6;
    const n = layer.particles || 8;
    const dist = layer.distance || 180;
    const out = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      const tx = Math.cos(ang) * dist;
      const ty = Math.sin(ang) * dist;
      out.push({
        type: "shape", shape: layer.shape || "sparkle", at: layer.at, size: 12,
        fill: layer.color || "#ffb74d",
        rotate: (i * 45),
        tracks: {
          offset: [[s, [0, 0]], [s + dur, [tx, ty], "out"]],
          scale:  [[s, [0, 0]], [s + dur * 0.3, [140, 140], "out"], [s + dur, [60, 60], "inOut"]],
          opacity: [[s, 0], [s + dur * 0.15, 1, "out"], [s + dur * 0.75, 1], [s + dur, 0, "in"]]
        }
      });
    }
    return out;
  }
  // 普通 shape layer：behavior 预设 → tracks
  if (layer.behavior && BEHAVIORS[layer.behavior]) {
    const preset = BEHAVIORS[layer.behavior](layer.startAt || 0, layer.duration);
    return [{ ...layer, tracks: { ...preset, ...(layer.tracks || {}) } }];
  }
  return [layer];
}

// ── 主渲染：frame-pure render(host, t, motion) ────────────
export function render(host, t, motion) {
  const [w, h] = motion.size;
  let svg = host.querySelector('svg');
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    host.appendChild(svg);
    // 预置渐变 defs
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <linearGradient id="heartGrad" x1="0" y1="-70" x2="0" y2="70" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ff5889"/>
        <stop offset="100%" stop-color="#e62566"/>
      </linearGradient>`;
    svg.appendChild(defs);
  }

  // 清除旧内容（保留 defs）
  Array.from(svg.children).forEach(c => { if (c.tagName !== 'defs') svg.removeChild(c); });

  // 展开所有 layer（ripple/burst/behavior → 原始 tracks）
  const expanded = motion.layers.flatMap(expandLayer);

  // 逐层按 t 求值并绘制
  for (const L of expanded) {
    const tracks = L.tracks || {};
    const opacity = tracks.opacity ? interp(tracks.opacity, t) : 1;
    if (opacity <= 0.001) continue;

    const scale = tracks.scale ? interp(tracks.scale, t) : [100, 100];
    const offset = tracks.offset ? interp(tracks.offset, t) : [0, 0];
    const rotate = tracks.rotate ? interp(tracks.rotate, t) : (L.rotate || 0);

    const [cx, cy] = L.at || [w/2, h/2];
    const sx = Array.isArray(scale) ? scale[0] / 100 : scale / 100;
    const sy = Array.isArray(scale) ? scale[1] / 100 : scale / 100;
    const tx = cx + offset[0];
    const ty = cy + offset[1];

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${tx} ${ty}) rotate(${rotate}) scale(${sx} ${sy})`);
    g.setAttribute('opacity', opacity);

    const shapeFn = SHAPES[L.shape];
    if (shapeFn) {
      g.innerHTML = shapeFn(L.size || 100);
      const el = g.firstElementChild;
      // 填充
      const fill = L.fill;
      if (fill === "gradient:heart") el.setAttribute('fill', 'url(#heartGrad)');
      else if (fill) el.setAttribute('fill', fill);
      // 描边
      if (L.stroke) {
        el.setAttribute('stroke', L.stroke);
        el.setAttribute('fill', el.getAttribute('fill') || 'none');
      }
    }
    svg.appendChild(g);
  }
}
