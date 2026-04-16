// scenes/16x9/blueprint-cinema/content-questionHook.js
// F1: 红问号 + 3 痛点卡 — 开场吸引注意
export default {
  id: "questionHook",
  name: "Question Hook",
  version: "1.0.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "开场红问号大字配3个痛点卡片，t驱动逐步揭示",
  duration_hint: 8,
  intent: "用大红问号做视觉锚点，3张痛点卡片错开150ms出现，制造情绪共鸣。背景深蓝，强调橙红，形成戏剧对比。每张卡对应一个真实痛点场景。",
  when_to_use: ["视频开头，快速建立共鸣","展示问题清单场景"],
  when_not_to_use: ["内容详解阶段（用jsonShowcase代替）"],
  limitations: ["卡片文字不超过12字/条"],
  inspired_by: "Kurzgesagt 开场大问号 + Vox 痛点列举",
  used_in: [],
  requires: [],
  pairs_well_with: ["brandTitle"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["intense", "serious"],
  tags: ["hook", "problem", "question", "content", "blueprint-cinema"],
  complexity: "simple",
  performance: { cost: "low", notes: "pure HTML/CSS" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    question: { type: "string", default: "想做视频，但 AI 不会？", semantic: "大问号标题" },
    pain1: { type: "string", default: "不知道该讲什么顺序", semantic: "痛点1" },
    pain2: { type: "string", default: "做完效果不够专业", semantic: "痛点2" },
    pain3: { type: "string", default: "每次都要重新发明轮子", semantic: "痛点3" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const q = eo(t / 0.7);
    const c1 = eo((t - 1.5) / 0.5);
    const c2 = eo((t - 2.0) / 0.5);
    const c3 = eo((t - 2.5) / 0.5);
    const question = params.question || "想做视频，但 AI 不会？";
    const pain1 = params.pain1 || "不知道该讲什么顺序";
    const pain2 = params.pain2 || "做完效果不够专业";
    const pain3 = params.pain3 || "每次都要重新发明轮子";

    function card(text, prog, yOff) {
      const op = Math.max(0, prog);
      const ty = (1 - prog) * 20;
      return `<div style="opacity:${op};transform:translateY(${ty}px);transition-property:none;
        background:rgba(255,107,53,0.12);border:1px solid rgba(255,107,53,0.4);
        border-radius:8px;padding:${H*0.025}px ${W*0.025}px;
        font:400 ${Math.round(W*0.018)}px/1.4 Inter,'PingFang SC',system-ui,sans-serif;
        color:#f5f2e8;margin-bottom:${H*0.018}px;">
        <span style="color:#ff6b35;margin-right:8px;">●</span>${text}
      </div>`;
    }

    return `
      <div style="position:absolute;inset:0;background:#0a1628;display:flex;align-items:center;padding:0 ${W*0.08}px;">
        <div style="display:flex;align-items:center;gap:${W*0.06}px;width:100%;">
          <div style="opacity:${q};transform:scale(${0.7 + 0.3*q});flex-shrink:0;
            font:700 ${Math.round(H*0.45)}px/1 Inter,system-ui,sans-serif;color:#ff6b35;
            text-shadow:0 0 ${80*q}px rgba(255,107,53,0.5);">?</div>
          <div style="flex:1;">
            <div style="opacity:${q};transform:translateY(${(1-q)*16}px);
              font:700 ${Math.round(W*0.032)}px/1.2 Inter,'PingFang SC',system-ui,sans-serif;
              color:#f5f2e8;margin-bottom:${H*0.04}px;">${question}</div>
            ${card(pain1, c1, 0)}
            ${card(pain2, c2, 0)}
            ${card(pain3, c3, 0)}
          </div>
        </div>
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "questionHook", phase: t < 0.7 ? "enter" : "show",
      progress: Math.min(1, t / 0.7), visible: true, params,
      elements: [
        { type: "headline", role: "question", value: params.question || "" },
        { type: "card", role: "pain1", value: params.pain1 || "" },
        { type: "card", role: "pain2", value: params.pain2 || "" },
        { type: "card", role: "pain3", value: params.pain3 || "" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return {
      question: "想做视频，但 AI 不会？",
      pain1: "不知道该讲什么顺序",
      pain2: "做完效果不够专业",
      pain3: "每次都要重新发明轮子",
    };
  },
};
