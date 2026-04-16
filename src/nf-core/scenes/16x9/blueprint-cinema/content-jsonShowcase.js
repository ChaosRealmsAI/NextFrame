// scenes/16x9/blueprint-cinema/content-jsonShowcase.js
// F3: JSON 代码块 + 渲染结果展示
export default {
  id: "jsonShowcase",
  name: "JSON Showcase",
  version: "1.0.0",
  ratio: "16:9",
  theme: "blueprint-cinema",
  role: "content",
  type: "dom",
  frame_pure: true,
  assets: [],
  description: "左侧JSON代码块，右侧渲染结果预览，展示输入输出关系",
  duration_hint: 8,
  intent: "用分屏对比展示JSON输入→HTML输出的核心价值。左侧代码用等宽字体和语法高亮，右侧用卡片模拟渲染结果。中间箭头在2s后出现强调转换关系。",
  when_to_use: ["展示数据到可视化的转换过程"],
  when_not_to_use: ["纯文字场景"],
  limitations: ["代码示例不超过8行"],
  inspired_by: "Fireship代码演示风格",
  used_in: [],
  requires: [],
  pairs_well_with: ["timelineDiagram"],
  conflicts_with: [],
  alternatives: [],
  visual_weight: "heavy",
  z_layer: "mid",
  mood: ["professional", "serious"],
  tags: ["code", "json", "demo", "content", "blueprint-cinema"],
  complexity: "medium",
  performance: { cost: "low", notes: "text only" },
  status: "stable",
  changelog: [{ version: "1.0.0", date: "2026-04-16", change: "initial" }],
  params: {
    title: { type: "string", default: "Timeline 描述视频结构", semantic: "标题" },
  },
  enter: null,
  exit: null,

  render(t, params, vp) {
    const W = vp.width, H = vp.height;
    const eo = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
    const kTitle = eo(t / 0.6);
    const kLeft = eo((t - 0.3) / 0.7);
    const kArrow = eo((t - 2.0) / 0.5);
    const kRight = eo((t - 2.5) / 0.6);
    // Line-by-line reveal for code
    const lines = [
      '{',
      '  "version": "0.8",',
      '  "width": 1920,',
      '  "anchors": {',
      '    "s1.begin": {"at": 0}',
      '  },',
      '  "tracks": [...]',
      '}',
    ];
    const revealedLines = lines.filter((_, i) => t > 0.3 + i * 0.25);
    const codeHtml = revealedLines.map((l, i) => {
      const lineT = t - (0.3 + i * 0.25);
      const op = eo(lineT / 0.3);
      const color = l.includes('"version"') || l.includes('"width"') ? '#58a6ff' :
                    l.includes('"anchors"') || l.includes('"tracks"') ? '#ff6b35' : '#f5f2e8';
      return `<div style="opacity:${op};color:${color};white-space:pre;">${l}</div>`;
    }).join('');

    const title = params.title || "Timeline 描述视频结构";
    return `
      <div style="position:absolute;inset:0;background:#0a1628;padding:${H*0.07}px ${W*0.05}px ${H*0.05}px;">
        <div style="opacity:${kTitle};transform:translateY(${(1-kTitle)*16}px);
          font:600 ${Math.round(W*0.022)}px/1.3 Inter,'PingFang SC',system-ui,sans-serif;
          color:#f5f2e8;margin-bottom:${H*0.04}px;">${title}</div>
        <div style="display:flex;align-items:center;gap:${W*0.03}px;height:${H*0.62}px;">
          <div style="opacity:${kLeft};flex:1;background:rgba(88,166,255,0.08);border:1px solid rgba(88,166,255,0.25);border-radius:8px;padding:${H*0.03}px ${W*0.025}px;
            font:400 ${Math.round(W*0.014)}px/1.8 'JetBrains Mono','SF Mono',Menlo,monospace;
            overflow:hidden;">${codeHtml}</div>
          <div style="opacity:${kArrow};flex-shrink:0;text-align:center;">
            <div style="font-size:${Math.round(W*0.04)}px;color:#ff6b35;transform:translateX(${(1-kArrow)*-20}px);">→</div>
            <div style="font:400 ${Math.round(W*0.012)}px/1.3 Inter,system-ui,sans-serif;color:#8b92a5;margin-top:4px;">render</div>
          </div>
          <div style="opacity:${kRight};flex:1;background:rgba(255,107,53,0.08);border:1px solid rgba(255,107,53,0.25);border-radius:8px;padding:${H*0.04}px;
            display:flex;flex-direction:column;align-items:center;justify-content:center;">
            <div style="width:80%;height:${H*0.12}px;background:linear-gradient(135deg,rgba(255,107,53,0.3),rgba(88,166,255,0.2));border-radius:6px;margin-bottom:${H*0.025}px;"></div>
            <div style="width:60%;height:${H*0.025}px;background:rgba(245,242,232,0.2);border-radius:4px;margin-bottom:${H*0.015}px;"></div>
            <div style="width:80%;height:${H*0.02}px;background:rgba(139,146,165,0.3);border-radius:4px;"></div>
            <div style="margin-top:${H*0.03}px;font:400 ${Math.round(W*0.013)}px/1.3 Inter,system-ui,sans-serif;color:#8b92a5;">HTML 输出</div>
          </div>
        </div>
      </div>`;
  },

  describe(t, params, vp) {
    return {
      sceneId: "jsonShowcase", phase: t < 1 ? "enter" : "show",
      progress: Math.min(1, t / 1.0), visible: true, params,
      elements: [
        { type: "code", role: "input", value: "timeline json" },
        { type: "preview", role: "output", value: "rendered html" },
      ],
      boundingBox: { x: 0, y: 0, w: vp.width, h: vp.height },
    };
  },

  sample() {
    return { title: "Timeline 描述视频结构" };
  },
};
