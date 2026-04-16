// content-timelineV.js — F5: 纵向时间轴，track 从上到下
export default {
  id: "timelineV",
  name: "timelineV",
  version: "1.0.0",
  ratio: "9:16",
  theme: "mobile-vertical",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "纵向时间轴：3 个 track 从上到下展示，带进度动画",
  duration_hint: 8,
  intent: "竖屏 3 条 track 从上到下排列，clip 以 scaleX 0.95→1 展开，持续 sweep 条循环扫过，展示多层时间轴概念。",
  when_to_use: ["解释 timeline 数据模型","展示多轨道"],
  when_not_to_use: ["纯展示场景"],
  limitations: ["固定 3 条 track"],
  inspired_by: "视频编辑器纵向时间轴",
  used_in: [],
  requires: [],
  pairs_well_with: ["jsonShowcaseV", "cliDemoV"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "serious"],
  tags: ["timeline", "tracks", "diagram", "content", "mobile-vertical"],
  complexity: "medium",
  performance: { cost: "low", notes: "pure dom" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    title:   { type: "string", default: "一条 Timeline",  semantic: "标题" },
    track1:  { type: "string", default: "Scene 层",       semantic: "Track 1 名" },
    track2:  { type: "string", default: "Audio 层",       semantic: "Track 2 名" },
    track3:  { type: "string", default: "字幕层",         semantic: "Track 3 名" },
    acColor: { type: "color",  default: "#2563eb",        semantic: "强调色" },
  },
  sample() {
    return { title: "一条 Timeline", track1: "Scene 层", track2: "Audio 层", track3: "字幕层", acColor: "#2563eb" };
  },
  render(t, params, vp) {
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    const entry = (delay = 0, dur = 0.2) => 0.9 + 0.1 * easeOut(clamp((t - delay) / dur, 0, 1));
    const tyX = (delay = 0, dur = 0.2) => -8 * (1 - easeOut(clamp((t - delay) / dur, 0, 1)));
    const tyY = (delay = 0, dur = 0.2) => 8 * (1 - easeOut(clamp((t - delay) / dur, 0, 1)));
    const kTitle = entry(0, 0.2);
    const ac = params.acColor || "#2563eb";
    const trackColors = [ac, "#10b981", "#f59e0b"];
    const trackNames = [params.track1 || "Scene 层", params.track2 || "Audio 层", params.track3 || "字幕层"];
    const clipWidths = [[60, 25, 35], [70, 30], [65, 20, 15]];
    // persistent progress sweep across timeline area (0-1 loop every ~6s)
    const sweepProg = (t * 0.16) % 1;
    const tracks = trackNames.map((name, ti) => {
      const delay = 0.1 + ti * 0.08;
      const k = entry(delay, 0.2);
      const clips = (clipWidths[ti] || [50]).map((w, ci) => {
        const cDelay = delay + 0.05 + ci * 0.05;
        const ck = entry(cDelay, 0.15);
        // scaleX must enter from 0.95 to 1, NOT 0 (else t=0 invisible)
        const cScaleX = 0.95 + 0.05 * easeOut(clamp((t - cDelay) / 0.15, 0, 1));
        // per-clip pulse
        const clipPulse = 0.85 + 0.15 * Math.sin(t * 1.5 + ti * 0.8 + ci * 0.4);
        return `<div style="flex:0 0 ${w}%;height:56px;background:${trackColors[ti]};border-radius:8px;
                             opacity:${ck * clipPulse};transform:scaleX(${cScaleX});transform-origin:left;margin-right:4px;
                             display:flex;align-items:center;padding:0 16px;">
          <div style="font:600 24px/1 Inter,sans-serif;color:#fff;white-space:nowrap;overflow:hidden;">Clip ${ci+1}</div>
        </div>`;
      }).join("");
      return `<div style="margin-bottom:32px;opacity:${k};transform:translateX(${tyX(delay,0.2)}px);">
        <div style="font:600 36px/1.3 Inter,'PingFang SC',sans-serif;color:#1f2937;margin-bottom:12px;">${esc(name)}</div>
        <div style="display:flex;background:#f1f5f9;border-radius:12px;padding:8px;overflow:hidden;position:relative;">
          ${clips}
          <div style="position:absolute;top:0;bottom:0;left:${sweepProg*100}%;width:3px;background:rgba(0,0,0,0.3);"></div>
        </div>
      </div>`;
    }).join("");
    return `
      <div style="position:absolute;inset:0;background:#fff;
                  display:flex;flex-direction:column;padding:220px 64px 240px;">
        <div style="font:700 80px/1.2 Inter,'PingFang SC',sans-serif;color:#1f2937;
                    margin-bottom:16px;opacity:${kTitle};transform:translateY(${tyY(0,0.2)}px);">${esc(params.title || "")}</div>
        <div style="font:400 40px/1.4 Inter,'PingFang SC',sans-serif;color:${ac};
                    margin-bottom:64px;opacity:${entry(0.08,0.2)};">多层并行，精确到毫秒</div>
        <div style="flex:1;">${tracks}</div>
      </div>`;
  },
  describe(t, params, vp) {
    return {
      sceneId: "timelineV", phase: t < 0.5 ? "enter" : "show", progress: Math.min(1, t / 0.7),
      visible: true, params,
      elements: [{ type: "title", role: "headline", value: params.title || "" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
};
