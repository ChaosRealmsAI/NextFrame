export default {
  id: "attentionDart",
  name: "attentionDart",
  version: "1.0.0",
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "overlay",
  description: "箭头指向 + dart behavior — 从画面外快速滑入目标点，带轻微回弹",
  duration_hint: 1.4,
  type: "dom",
  frame_pure: false,
  assets: [],
  intent: `attentionDart 的目标不是当 icon，而是当『视觉指针』。很多讲解视频在切细节时缺一个明确的注意力导向，观众会自己找焦点，效率很低。这里用一个暖橙箭头从画面外快速 dart 进来，最后轻微 overshoot 再回到目标位，眼睛会天然跟着运动终点停住。再给 target 位放一个小圆点和淡环，就能明确告诉观众“看这里”。它属于功能性动效，不花哨，但非常实用。`,
  when_to_use: ["指向某个 UI 区域、关键词或图表节点", "镜头里需要快速建立观看焦点", "做教程或拆解时引导注意力"],
  when_not_to_use: ["整个画面已经在高速运动", "需要柔和过渡而不是明确指向", "目标区域太靠边导致箭头无法完整展示"],
  limitations: ["默认从左侧入场，如需改方向需调整 fromX/fromY", "箭头适合单目标，不适合多处同时指示", "最好配合留白目标区，不然指向意义会变弱"],
  inspired_by: "演示视频中的 focus arrow callout",
  used_in: [],
  requires: [],
  pairs_well_with: ["analogyCard", "slotGrid", "glossaryCard"],
  conflicts_with: [],
  alternatives: ["pathTrace"],
  visual_weight: "medium",
  z_layer: "foreground",
  mood: ["direct", "useful", "precise"],
  tags: ["motion", "arrow", "dart", "attention", "overlay", "anthropic-warm"],
  complexity: "simple",
  performance: { cost: "low", notes: "arrow, target ring and dot; all values derived directly from t" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial attention dart pointer for NF-Motion launch" }],
  params: {
    duration: { type: "number", default: 1.4, semantic: "总时长" },
    color: { type: "color", default: "#da7756", semantic: "箭头颜色" },
    targetX: { type: "number", default: 0.72, semantic: "目标点 x，占 viewport 宽度比例" },
    targetY: { type: "number", default: 0.42, semantic: "目标点 y，占 viewport 高度比例" },
  },
  enter: null,
  exit: null,
  render(host, t, params, vp) {
    const W = vp.width;
    const H = vp.height;
    const duration = Number(params.duration) || 1.4;
    const tx = W * (Number(params.targetX) || 0.72);
    const ty = H * (Number(params.targetY) || 0.42);
    const ringP = localProgress(t, 0.82, 0.58);
    const ringOpacity = interpFrames([[0, 0.18], [0.14, 0.5, "out"], [0.42, 0.18, "out"], [0.66, 0.5, "out"], [1, 0.5, "out"]], ringP);
    const dotBreathe = 0.5 - 0.5 * Math.cos(ringP * Math.PI * 2);
    const dotScale = 0.84 + 0.28 * dotBreathe;
    const dotOpacity = 0.5 + 0.5 * dotBreathe;
    const dartP = localProgress(t, 0, 0.95);
    const arrowOpacity = interpFrames([[0, 0], [0.18, 1, "out"], [1, 1, "linear"]], dartP);
    const arrowX = interpFrames([[0, -W * 0.34], [0.72, 16, "outBack"], [1, 0, "inOut"]], dartP);
    const arrowY = interpFrames([[0, -H * 0.02], [0.72, 0, "outBack"], [1, 0, "inOut"]], dartP);
    const color = escapeAttr(params.color || "#da7756");
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="position:absolute;inset:0;display:block"><circle cx="${tx}" cy="${ty}" r="44" fill="none" stroke="rgba(218,119,86,.22)" stroke-width="4" opacity="${ringOpacity.toFixed(3)}"/><circle cx="${tx}" cy="${ty}" r="${(18 * dotScale).toFixed(3)}" fill="#da7756" opacity="${dotOpacity.toFixed(3)}"/><g transform="translate(${(tx + arrowX).toFixed(3)} ${(ty + arrowY).toFixed(3)}) rotate(-10) scale(1.18)" opacity="${arrowOpacity.toFixed(3)}"><path d="${ARROW_PATH}" fill="${color}"/></g></svg>`;
  },
  describe(t, params, vp) {
    const duration = Number(params.duration) || 1.4;
    return {
      sceneId: "attentionDart",
      phase: t < 0.95 ? "dart" : "target",
      progress: Math.max(0, Math.min(1, t / duration)),
      visible: true,
      params,
      elements: [{ type: "arrow", role: "pointer" }, { type: "dot", role: "target" }, { type: "ring", role: "target-accent" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
  sample() {
    return { duration: 1.4, color: "#da7756", targetX: 0.72, targetY: 0.42 };
  },
};

const ARROW_PATH = "M-60,-16L18,-16L18,-38L70,0L18,38L18,16L-60,16Z";

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
    return v0 + (v1 - v0) * eased;
  }
  return frames[frames.length - 1][1];
}

function escapeAttr(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
