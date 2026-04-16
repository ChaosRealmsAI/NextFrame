// scenes/16x9/blueprint-cinema/content-dualOutput.js
// F7: 横屏+竖屏 mp4 缩略图对比
export default {
  id: "dualOutput",
  name: "Dual Output",
  version: "1.0.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "横屏和竖屏MP4缩略图并列展示，强调一套叙事两种适配",
  duration_hint: 8,
  intent: "用并排的横屏/竖屏模拟框架展示同一内容的双格式输出。横屏左置宽，竖屏右置窄高，中间箭头从源JSON出发。3s后两个播放按钮同时出现，强调同时产出。",
  when_to_use: ["展示多格式输出能力"],
  when_not_to_use: ["只有单一输出格式时"],
  limitations: ["固定横屏+竖屏两种"],
  inspired_by: "设计工具多尺寸预览面板",
  used_in: [],
  requires: [],
  pairs_well_with: ["cliDemo"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "medium",
  z_layer: "mid",
  mood: ["professional", "calm"],
  tags: ["output", "landscape", "portrait", "dual", "content", "blueprint-cinema"],
  complexity: "simple",
  performance: { cost: "low", notes: "pure dom" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    title: { type: "string", default: "横屏竖屏，同一叙事，两套适配", semantic: "标题" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const kTitle = eo(t / 0.6);
    const kLeft = eo((t - 0.5) / 0.6);
    const kArrow = eo((t - 1.5) / 0.5);
    const kRight = eo((t - 2.0) / 0.6);
    const kPlay = eo((t - 3.0) / 0.5);
    const title = params.title || "横屏竖屏，同一叙事，两套适配";

    const lsW = Math.round(W * 0.33);
    const lsH = Math.round(lsW * 9 / 16);
    const ptW = Math.round(H * 0.42 * 9 / 16);
    const ptH = Math.round(H * 0.42);

    function playBtn(op) {
      return `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        opacity:${op};width:48px;height:48px;background:rgba(255,107,53,0.9);border-radius:50%;
        display:flex;align-items:center;justify-content:center;
        font-size:20px;color:#fff;">▶</div>`;
    }

    return `
      <div style="position:absolute;inset:0;background:#0a1628;display:flex;flex-direction:column;align-items:center;padding-top:${H*0.07}px;">
        <div style="opacity:${kTitle};transform:translateY(${(1-kTitle)*16}px);
          font:600 ${Math.round(W*0.022)}px/1.3 Inter,'PingFang SC',system-ui,sans-serif;
          color:#f5f2e8;margin-bottom:${H*0.05}px;">${title}</div>
        <div style="display:flex;align-items:center;gap:${W*0.04}px;">
          <div style="display:flex;flex-direction:column;align-items:center;gap:${H*0.015}px;opacity:${kLeft};">
            <div style="position:relative;width:${lsW}px;height:${lsH}px;
              background:linear-gradient(135deg,#0a2040,#1a3060);
              border:2px solid rgba(88,166,255,0.4);border-radius:6px;overflow:hidden;">
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
                <div style="width:60%;height:40%;background:rgba(88,166,255,0.15);border-radius:4px;"></div>
              </div>
              ${playBtn(kPlay)}
            </div>
            <div style="font:400 ${Math.round(W*0.013)}px/1.3 Inter,system-ui,sans-serif;color:#8b92a5;">1920 × 1080 · 16:9</div>
          </div>
          <div style="opacity:${kArrow};text-align:center;">
            <div style="font-size:${Math.round(W*0.025)}px;color:#ff6b35;">⇔</div>
            <div style="font:400 ${Math.round(W*0.012)}px/1.3 Inter,system-ui,sans-serif;color:#8b92a5;margin-top:4px;">同一 JSON</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:center;gap:${H*0.015}px;opacity:${kRight};">
            <div style="position:relative;width:${ptW}px;height:${ptH}px;
              background:linear-gradient(135deg,#200a40,#401060);
              border:2px solid rgba(255,107,53,0.4);border-radius:6px;overflow:hidden;">
              <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;">
                <div style="width:70%;height:20%;background:rgba(255,107,53,0.15);border-radius:4px;"></div>
                <div style="width:50%;height:12%;background:rgba(139,146,165,0.15);border-radius:4px;"></div>
              </div>
              ${playBtn(kPlay)}
            </div>
            <div style="font:400 ${Math.round(W*0.013)}px/1.3 Inter,system-ui,sans-serif;color:#8b92a5;">1080 × 1920 · 9:16</div>
          </div>
        </div>
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "dualOutput", phase: t < 1 ? "enter" : "show",
      progress: Math.min(1, t / 1.0), visible: true, params,
      elements: [
        { type: "preview", role: "landscape", value: "1920x1080" },
        { type: "preview", role: "portrait", value: "1080x1920" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { title: "横屏竖屏，同一叙事，两套适配" };
  },
};
