import { getPreset, scaleW, scaleH } from "../../../shared/design.js";

export const meta = {
  id: "subtitleBar",
  version: 1,
  ratio: "16:9",
  category: "overlays",
  label: "Subtitle Bar",
  description: "底部字幕条，使用 srt 格式 [{s, e, t}]，自动查找当前时间字幕",
  tech: "dom",
  duration_hint: 30,
  loopable: false,
  z_hint: "top",
  tags: ["overlays", "subtitle", "srt"],
  mood: ["professional"],
  theme: ["tech"],
  default_theme: "lecture-warm",
  themes: { "lecture-warm": {} },
  params: {
    srt: {
      type: "array",
      default: [{ s: 0, e: 3, t: "字幕示例" }],
      label: "SRT字幕数组 [{s, e, t}]",
      group: "content",
    },
  },
  ai: {
    when: "讲解视频字幕层，配合 TTS 音频同步显示",
    how: "Add as layer: { scene: \"subtitleBar\", start: 0, dur: 30, params: { srt: [{s:0,e:3,t:\"...\"}] } }",
    example: { srt: [{ s: 0, e: 3, t: "Claude Code Hooks 是什么？" }, { s: 4, e: 8, t: "像安检员一样拦截 AI 操作" }] },
    avoid: "不要用 segments 格式（那是访谈格式），讲解视频用 srt 格式",
    pairs_with: ["lectureChrome", "headlineCenter", "codeTerminal", "flowDiagram"],
  },
};

function esc(s) { return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

export function render(t, params, vp) {
  const preset = getPreset("lecture-warm");
  const { colors, layout } = preset;

  const W = vp.width;
  const H = vp.height;
  const bw = layout.baseW;
  const bh = layout.baseH;

  const srt = params.srt || [];

  // Find active subtitle
  let activeSub = null;
  for (let i = 0; i < srt.length; i++) {
    const cue = srt[i];
    if (t >= cue.s && t < cue.e) {
      activeSub = cue;
      break;
    }
  }

  if (!activeSub) return `<div style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none"></div>`;

  // Animate: fade in first 0.15s of cue
  const elapsed = t - activeSub.s;
  const alpha = Math.min(1, ease3(elapsed / 0.15));

  const subBottom = scaleH(vp, layout.subtitle.bottom, bh);
  const subLeft   = scaleW(vp, layout.subtitle.left, bw);
  const subRight  = scaleW(vp, layout.subtitle.right, bw);
  const subH      = scaleH(vp, layout.subtitle.height, bh);
  const sz        = scaleW(vp, preset.type.srtText.size, bw);
  const padX      = scaleW(vp, 20, bw);
  const padY      = scaleH(vp, 10, bh);
  const bRadius   = scaleW(vp, 8, bw);

  return `<div style="position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none">
  <div style="position:absolute;left:${subLeft}px;right:${subRight}px;bottom:${subBottom}px;min-height:${subH}px;display:flex;align-items:center;justify-content:center;opacity:${alpha}">
    <div style="background:rgba(0,0,0,0.72);border-radius:${bRadius}px;padding:${padY}px ${padX * 2}px;text-align:center">
      <span style="font-family:${preset.type.srtText.font};font-size:${sz}px;font-weight:${preset.type.srtText.weight};line-height:${preset.type.srtText.lineHeight};color:${colors.text}">${esc(activeSub.t)}</span>
    </div>
  </div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0.5, label: "first subtitle" },
    { t: 5, label: "mid" },
    { t: 15, label: "late" },
  ];
}

export function lint(params) {
  const errors = [];
  if (params.srt !== undefined && !Array.isArray(params.srt)) {
    errors.push("srt must be an array");
  }
  return { ok: errors.length === 0, errors };
}
