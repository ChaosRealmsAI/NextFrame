// content-cliDemoV.js — F6: CLI 命令展示 + 进度条
export default {
  id: "cliDemoV",
  name: "cliDemoV",
  version: "1.0.0",
  ratio: "9:16",
  theme: "mobile-vertical",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "CLI Demo：终端命令 + 动态进度条，展示录制流程",
  duration_hint: 8,
  params: {
    title:   { type: "string", default: "一行命令，出视频", semantic: "标题" },
    cmd:     { type: "string", default: "nextframe render timeline.json out.mp4", semantic: "CLI 命令" },
    step1:   { type: "string", default: "✓ 验证 Timeline",   semantic: "步骤1" },
    step2:   { type: "string", default: "✓ 渲染 60 帧",      semantic: "步骤2" },
    step3:   { type: "string", default: "✓ 导出 MP4",        semantic: "步骤3" },
    acColor: { type: "color",  default: "#2563eb",           semantic: "强调色" },
  },
  sample() {
    return { title: "一行命令，出视频", cmd: "nextframe render timeline.json out.mp4", step1: "✓ 验证 Timeline", step2: "✓ 渲染 60 帧", step3: "✓ 导出 MP4", acColor: "#2563eb" };
  },
  render(t, params, vp) {
    const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const easeOut = (x) => 1 - Math.pow(1 - x, 3);
    const ac = params.acColor || "#2563eb";
    const kTitle = easeOut(clamp(t / 0.4, 0, 1));
    const kCmd = easeOut(clamp((t - 0.3) / 0.4, 0, 1));
    const progress = clamp((t - 0.6) / 2.0, 0, 1);
    const kBar = easeOut(clamp((t - 0.6) / 0.3, 0, 1));
    const steps = [params.step1, params.step2, params.step3].map((s, i) => {
      const k = easeOut(clamp((t - 0.6 - i * 0.3) / 0.4, 0, 1));
      return `<div style="font:500 36px/1.5 Inter,'PingFang SC',sans-serif;color:#10b981;
                          opacity:${k};transform:translateX(${(1-k)*20}px);margin-top:16px;">${esc(s || "")}</div>`;
    }).join("");
    return `
      <div style="position:absolute;inset:0;background:#0d1117;
                  display:flex;flex-direction:column;padding:220px 64px 240px;">
        <div style="font:700 80px/1.2 Inter,'PingFang SC',sans-serif;color:#fff;
                    margin-bottom:56px;opacity:${kTitle};">${esc(params.title || "")}</div>
        <div style="background:#161b22;border-radius:20px;padding:40px;margin-bottom:48px;
                    border:2px solid #30363d;opacity:${kCmd};">
          <div style="font:400 24px/1.4 'Courier New',monospace;color:#58a6ff;margin-bottom:8px;">$ </div>
          <div style="font:500 36px/1.5 'Courier New',monospace;color:#e6edf3;word-break:break-all;">${esc(params.cmd || "")}</div>
        </div>
        <div style="background:#161b22;border-radius:16px;padding:8px;margin-bottom:32px;opacity:${kBar};">
          <div style="height:16px;background:${ac};border-radius:8px;width:${Math.round(progress*100)}%;
                      transition:none;"></div>
        </div>
        ${steps}
      </div>`;
  },
  describe(t, params, vp) {
    return {
      sceneId: "cliDemoV", phase: t < 0.5 ? "enter" : "show", progress: Math.min(1, t / 2.6),
      visible: true, params,
      elements: [{ type: "title", role: "headline", value: params.title || "" }],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },
};
