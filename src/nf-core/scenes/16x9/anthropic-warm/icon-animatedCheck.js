export default {
  id: "animatedCheck",
  name: "animatedCheck",
  version: "1.0.0",
  ratio: "16:9",
  theme: "anthropic-warm",
  role: "content",
  description: "勾号描边入场 + pop — stroke-dashoffset 纯 t 驱动，随后整体轻微弹入",
  duration_hint: 1.8,
  type: "dom",
  frame_pure: false,
  assets: [],
  intent: `这个组件解决的是「确认」的可读性问题。单纯把一个 check 放上去太死，单纯做放大又会像廉价 UI 动效，所以这里把两个 verb 叠起来：第一层是路径描边，从 dashoffset=120 走到 0，让观众看到勾号被写出来；第二层是 pop behavior，让整个图标在描边后带一点 overshoot，形成“落地”的确定感。配色用 anthropic-warm 里的 green，不抢主题主色，但在暖棕背景上仍然足够醒目。`,
  when_to_use: ["任务完成、校验通过、状态确认", "讲解流程里需要一个『完成』图标锚点", "列表步骤中的终点确认"],
  when_not_to_use: ["需要表达情绪而不是结果", "需要错误或警告状态", "画面里已经有大量绿色提示"],
  limitations: ["默认是单图标，不承载长文本", "勾号路径长度按 120 近似，换路径时要同步改 dash 值", "更适合 1-2 秒短确认"],
  inspired_by: "iOS 完成态图标 + 手写式 SVG stroke reveal",
  used_in: [],
  requires: [],
  pairs_well_with: ["statBig", "slotGrid", "goldenClose"],
  conflicts_with: [],
  alternatives: ["heartLike"],
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["clear", "confident", "resolved"],
  tags: ["motion", "check", "icon", "success", "path", "anthropic-warm"],
  complexity: "simple",
  performance: { cost: "low", notes: "single check path plus faint backing ring" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial animated check icon for NF-Motion launch" }],
  params: {
    duration: { type: "number", default: 1.8, semantic: "总时长" },
    color: { type: "color", default: "#7ec699", semantic: "勾号颜色" },
    ringColor: { type: "color", default: "rgba(126,198,153,.18)", semantic: "背景圆环颜色" },
  },
  enter: null,
  exit: null,
  render(host, t, params, vp) {
    const W = vp.width;
    const H = vp.height;
    const duration = Number(params.duration) || 1.8;
    const cx = W * 0.5;
    const cy = H * 0.5;
    const ringP = localProgress(t, 0, 0.8);
    const ringOpacity = interpFrames([[0, 0], [0.18, 1, "out"], [1, 1, "linear"]], ringP);
    const ringScale = interpFrames([[0, 0.7], [0.46, 1.2, "outBack"], [0.72, 0.96, "inOut"], [1, 1, "out"]], ringP);
    const checkPop = localProgress(t, 0.12, 0.9);
    const checkScale = interpFrames([[0, 0.7], [0.46, 1.2, "outBack"], [0.72, 0.96, "inOut"], [1, 1, "out"]], checkPop);
    const dashoffset = interpFrames([[0, 120], [0.9, 0, "out"], [duration, 0, "linear"]], Math.max(0, t));
    host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="position:absolute;inset:0;display:block"><circle cx="${cx}" cy="${cy}" r="${(70 * ringScale).toFixed(3)}" fill="none" stroke="${escapeAttr(params.ringColor || "rgba(126,198,153,.18)")}" stroke-width="4" opacity="${ringOpacity.toFixed(3)}"/><g transform="translate(${cx} ${cy}) scale(${(1.4 * checkScale).toFixed(3)})"><path d="${CHECK_PATH}" fill="none" stroke="${escapeAttr(params.color || "#7ec699")}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="120" stroke-dashoffset="${dashoffset.toFixed(3)}"/></g></svg>`;
  },
  describe(t, params, vp) {
    const duration = Number(params.duration) || 1.8;
    return {
      sceneId: "animatedCheck",
      phase: t < 0.9 ? "draw" : "settle",
      progress: Math.max(0, Math.min(1, t / duration)),
      visible: true,
      params,
      elements: [{ type: "check", role: "primary" }, { type: "ring", role: "backdrop" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
  sample() {
    return { duration: 1.8, color: "#7ec699", ringColor: "rgba(126,198,153,.18)" };
  },
};

const CHECK_PATH = "M-44,2L-12,34L46,-30";

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
