export default {
  id: "heartLike",
  name: "heartLike",
  version: "1.0.0",
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "overlay",
  description: "点赞效果 — ripple + burst + heart impact，适合做『喜欢 / 通过 / 命中』的瞬时反馈",
  duration_hint: 2.5,
  type: "dom",
  frame_pure: false,
  assets: [],
  intent: `这是 NF-Motion 首发里最像「一眼就懂」的反馈组件：中心心形先 impact 弹出，随后一圈暖粉 ripple 撑开，最后橙金 sparkle burst 往外炸。它不靠位移动画讲叙事，而是靠「压缩 -> 弹出 -> 外溢」讲情绪释放，所以非常适合点赞、命中、确认、收藏这种 1 秒内要被观众读懂的动作。颜色全部贴 anthropic-warm：心是暖粉，外圈是更浅的粉，粒子是偏金橙，既有温度也不偏赛博。`,
  when_to_use: ["视频里需要一个明确的『喜欢/命中/通过』反馈瞬间", "章节中段想插入一个轻量、高可读的情绪锚点", "做 UI 手势示意时需要一个可循环的小型反馈件"],
  when_not_to_use: ["需要严肃、中性的确认状态", "画面已经有很多粒子或爆炸性元素", "需要持续驻留而不是瞬时爆发"],
  limitations: ["默认是居中单体构图，不适合承载正文", "burst 粒子数量建议 6-12，太多会喧宾夺主", "更适合 1.5-3s 的短时反馈，不适合超长镜头"],
  inspired_by: "社交产品点赞反馈 + Apple/Anthropic 风的暖色 SVG micro-motion",
  used_in: [],
  requires: [],
  pairs_well_with: ["statBig", "glossaryCard", "goldenClose"],
  conflicts_with: [],
  alternatives: ["loadingPulse", "animatedCheck"],
  visual_weight: "medium",
  z_layer: "foreground",
  mood: ["warm", "affirming", "playful"],
  tags: ["motion", "heart", "like", "feedback", "overlay", "anthropic-warm"],
  complexity: "simple",
  performance: { cost: "low", notes: "3 semantic SVG layers resolved directly from t" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial NF-Motion launch component from verified POC heart-like config" }],
  params: {
    duration: { type: "number", default: 2.5, semantic: "总时长，建议 2-3 秒" },
    heartColor: { type: "string", default: "gradient:heart", semantic: "心形填充，可用 gradient:heart 或纯色" },
    rippleColor: { type: "color", default: "#ff9ab8", semantic: "外圈 ripple 颜色" },
    burstColor: { type: "color", default: "#ffb44d", semantic: "sparkle burst 颜色" },
  },
  enter: null,
  exit: null,
  render(host, t, params, vp) {
    const W = vp.width;
    const H = vp.height;
    const duration = Number(params.duration) || 2.5;
    const cx = W * 0.5;
    const cy = H * 0.5;
    const heartP = localProgress(t, 0, 1.5);
    const heartOpacity = interpFrames([[0, 0], [0.08, 1, "out"], [1, 1, "linear"]], heartP);
    const heartScale = interpFrames([[0, [0, 0]], [0.2, [0.7, 0.7], "out"], [0.33, [0.85, 0.55], "inOut"], [0.6, [1.15, 1.3], "outBack"], [0.82, [1.03, 0.97], "inOut"], [0.92, [0.98, 1.02], "inOut"], [1, [1, 1], "out"]], heartP);
    const rippleP = localProgress(t, 0.4, 0.9);
    const rippleRadius = 20 + 180 * easeOutQuad(rippleP);
    const rippleOpacity = 0.8 * (1 - easeInQuad(rippleP));
    const burstP = localProgress(t, 0.47, 0.7);
    const burstDistance = 180 * easeOutQuad(burstP);
    const burstScale = interpFrames([[0, 0], [0.3, 1.4, "out"], [1, 0.6, "inOut"]], burstP);
    const burstOpacity = interpFrames([[0, 0], [0.15, 1, "out"], [0.75, 1, "linear"], [1, 0, "inOut"]], burstP);
    const heartFill = params.heartColor || "gradient:heart";
    const defs = heartFill === "gradient:heart"
      ? `<defs><linearGradient id="heartLikeHeart" x1="0" y1="-70" x2="0" y2="70" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#ff5889"/><stop offset="100%" stop-color="#e62566"/></linearGradient></defs>`
      : "";
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="position:absolute;inset:0;display:block">${defs}${rippleOpacity > 0.001 ? `<circle cx="${cx}" cy="${cy}" r="${rippleRadius.toFixed(3)}" fill="none" stroke="${escapeAttr(params.rippleColor || "#ff9ab8")}" stroke-width="4" opacity="${rippleOpacity.toFixed(3)}"/>` : ""}${renderBurst(cx, cy, burstDistance, burstScale, burstOpacity, params.burstColor || "#ffb44d")}<g transform="translate(${cx} ${cy}) scale(${heartScale[0].toFixed(3)} ${heartScale[1].toFixed(3)})" opacity="${heartOpacity.toFixed(3)}"><path d="${HEART_PATH}" fill="${heartFill === "gradient:heart" ? "url(#heartLikeHeart)" : escapeAttr(heartFill)}"/></g></svg>`;
  },
  describe(t, params, vp) {
    const duration = Number(params.duration) || 2.5;
    const progress = Math.max(0, Math.min(1, t / duration));
    return {
      sceneId: "heartLike",
      phase: t < 0.45 ? "impact" : t < 1.2 ? "burst" : "settle",
      progress,
      visible: true,
      params,
      elements: [{ type: "heart", role: "primary" }, { type: "ripple", role: "accent" }, { type: "sparkles", role: "burst", count: 8 }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
  sample() {
    return { duration: 2.5, heartColor: "gradient:heart", rippleColor: "#ff9ab8", burstColor: "#ffb44d" };
  },
};

const HEART_PATH = "M0,-15C0,-40 -30,-55 -55,-45C-85,-30 -90,10 -60,35C-30,55 -5,65 0,75C5,65 30,55 60,35C90,10 85,-30 55,-45C30,-55 0,-40 0,-15Z";
const SPARKLE_PATH = "M0,-18L4,-4L18,0L4,4L0,18L-4,4L-18,0L-4,-4Z";

function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function localProgress(t, startAt, duration) {
  return clamp01((t - startAt) / Math.max(0.0001, duration));
}

function easeOutQuad(value) {
  const p = clamp01(value);
  return 1 - (1 - p) * (1 - p);
}

function easeInQuad(value) {
  const p = clamp01(value);
  return p * p;
}

function easeInOutQuad(value) {
  const p = clamp01(value);
  return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
}

function easeOutBack(value) {
  const p = clamp01(value);
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
}

function interpFrames(frames, p) {
  if (p <= frames[0][0]) return frames[0][1];
  for (let i = 0; i < frames.length - 1; i++) {
    const [t0, v0] = frames[i];
    const [t1, v1, ease = "inOut"] = frames[i + 1];
    if (p > t1) continue;
    const local = clamp01((p - t0) / Math.max(0.0001, t1 - t0));
    const eased = ease === "outBack" ? easeOutBack(local)
      : ease === "out" ? easeOutQuad(local)
      : ease === "linear" ? local
      : easeInOutQuad(local);
    if (Array.isArray(v0) && Array.isArray(v1)) {
      return v0.map((value, index) => value + ((v1[index] ?? value) - value) * eased);
    }
    return v0 + (v1 - v0) * eased;
  }
  return frames[frames.length - 1][1];
}

function renderBurst(cx, cy, distance, scale, opacity, color) {
  if (opacity <= 0.001 || scale <= 0.001) return "";
  const parts = [];
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * Math.PI * 2;
    const x = cx + Math.cos(angle) * distance;
    const y = cy + Math.sin(angle) * distance;
    parts.push(`<g transform="translate(${x.toFixed(3)} ${y.toFixed(3)}) scale(${(0.18 * scale).toFixed(3)})" opacity="${opacity.toFixed(3)}"><path d="${SPARKLE_PATH}" fill="${escapeAttr(color)}"/></g>`);
  }
  return parts.join("");
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
