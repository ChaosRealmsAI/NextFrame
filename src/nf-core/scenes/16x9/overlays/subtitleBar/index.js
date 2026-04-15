import { getPreset, esc, scaleW, scaleH, fadeIn } from "../../../shared/design.js";

const PRESET_NAME = "lecture-warm";

const SAMPLE_SRT = [
  { s: 0, e: 4.8, zh: "Claude Code 不只是转发你的问题。", en: "Claude Code does more than forward your prompt." },
  { s: 4.8, e: 10.2, zh: "它会先拼一整个运行时上下文包。", en: "It first assembles a full runtime context bundle." },
  { s: 10.2, e: 15.8, zh: "系统提示、工具定义、repo 状态，都会一起进模型。", en: "System prompt, tool schema, and repo state all go in." },
];

function getParts() {
  const preset = getPreset(PRESET_NAME);
  return {
    colors: preset.colors || {},
    layout: preset.layout || {},
    type: preset.type || {},
  };
}

function getActiveCue(srt, t) {
  if (!Array.isArray(srt)) return null;
  for (let index = 0; index < srt.length; index += 1) {
    const cue = srt[index];
    if (t >= Number(cue.s || 0) && t < Number(cue.e || 0)) return cue;
  }
  return null;
}

export const meta = {
  id: "subtitleBar",
  version: 1,
  ratio: "16:9",
  category: "overlays",
  label: "Subtitle Bar",
  description: "底部双语字幕条，直接读取简单 SRT 数组 {s,e,zh,en} 并在底部安全区显示。",
  tech: "dom",
  duration_hint: 30,
  loopable: true,
  z_hint: "top",
  tags: ["subtitle", "srt", "bilingual", "lecture"],
  mood: ["readable", "editorial", "clean"],
  theme: ["lecture-warm"],
  default_theme: PRESET_NAME,
  themes: {
    "lecture-warm": {},
    "lecture-soft": {},
    "lecture-contrast": {},
  },
  params: {
    srt: { type: "array", default: SAMPLE_SRT, label: "字幕数组", group: "content", semantic: "srt [{s,e,zh,en}]" },
    label: { type: "string", default: "SUBTITLE", label: "角标", group: "content" },
  },
  ai: {
    when: "需要在讲解视频底部持续显示字幕时使用，支持中文主字幕和英文辅字幕。",
    how: "把整段的 {s,e,zh,en} 数组传进 srt，scene 会按 layer 相对时间自动查找当前 cue。",
    example: {
      srt: SAMPLE_SRT,
      label: "SUBTITLE",
    },
    avoid: "不要传字符串而不是数组；如果字幕过长，先在上游拆句，避免单条 cue 塞满整行。",
    pairs_with: ["lectureChrome", "headlineCenter", "codeTerminal"],
  },
};

export function render(t, params, vp) {
  const { colors, layout, type } = getParts();
  const baseW = layout.baseW || 1920;
  const baseH = layout.baseH || 1080;
  const cue = getActiveCue(params.srt, t);
  if (!cue) return "";

  const left = scaleW(vp, layout.subtitle?.left || 120, baseW);
  const right = scaleW(vp, layout.subtitle?.right || 120, baseW);
  const bottom = scaleH(vp, layout.subtitle?.bottom || 60, baseH);
  const height = scaleH(vp, layout.subtitle?.height || 80, baseH);
  const opacity = fadeIn(t, 0, 0.18);

  return `
    <div style="position:absolute;left:${left}px;right:${right}px;bottom:${bottom}px;min-height:${height}px;display:flex;justify-content:center;align-items:flex-end;opacity:${opacity};pointer-events:none;">
      <div style="display:flex;align-items:flex-start;gap:${scaleW(vp, 18, baseW)}px;width:100%;padding:${scaleH(vp, 14, baseH)}px ${scaleW(vp, 18, baseW)}px;border:1px solid ${colors.textFaint};border-radius:${scaleW(vp, 16, baseW)}px;background:${colors.bg};backdrop-filter:blur(${scaleW(vp, 18, baseW)}px);box-shadow:0 ${scaleH(vp, 12, baseH)}px ${scaleW(vp, 28, baseW)}px ${colors.bg};">
        <div style="flex:0 0 auto;padding:${scaleH(vp, 7, baseH)}px ${scaleW(vp, 12, baseW)}px;border:1px solid ${colors.accent};border-radius:${scaleW(vp, 999, baseW)}px;background:${colors.codeBg};font-family:${type.chromeBrand?.font};font-size:${scaleW(vp, 13, baseW)}px;font-weight:${type.chromeBrand?.weight || 700};letter-spacing:0.08em;color:${colors.primary};text-transform:uppercase;">
          ${esc(params.label)}
        </div>
        <div style="flex:1 1 auto;">
          <div style="font-family:${type.srtText?.font};font-size:${scaleW(vp, type.srtText?.size || 32, baseW)}px;font-weight:${type.srtText?.weight || 500};line-height:${type.srtText?.lineHeight || 1.5};color:${colors.text};text-align:center;">
            ${esc(cue.zh || cue.t || "")}
          </div>
          ${(cue.en ? `
            <div style="margin-top:${scaleH(vp, 6, baseH)}px;font-family:${type.panelBody?.font};font-size:${scaleW(vp, 18, baseW)}px;font-weight:${type.panelBody?.weight || 400};line-height:1.5;color:${colors.textDim};text-align:center;">
              ${esc(cue.en)}
            </div>
          ` : "")}
        </div>
      </div>
    </div>
  `;
}

export function screenshots() {
  return [
    { t: 1, label: "first-cue" },
    { t: 7, label: "second-cue" },
    { t: 12, label: "third-cue" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!Array.isArray(params.srt)) {
    errors.push("srt must be an array");
  } else if (params.srt.length === 0) {
    errors.push("srt must contain at least one cue");
  } else {
    const sample = params.srt[0];
    if (!sample || typeof sample.s !== "number" || typeof sample.e !== "number") {
      errors.push("srt entries must include numeric s and e");
    }
  }
  if (!params.label) errors.push("label is required");
  return { ok: errors.length === 0, errors };
}
