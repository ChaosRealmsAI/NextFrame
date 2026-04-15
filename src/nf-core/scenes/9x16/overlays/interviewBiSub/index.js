import { getPreset, esc, scaleW, scaleH, findActiveSub } from "../../../shared/design.js";

const PRESET_NAME = "interview-dark";

export const meta = {
  id: "interviewBiSub",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Bilingual Subtitles",
  description: "9:16 访谈双语字幕区，两级查找：segment→英文，cn[]→中文，说话人颜色区分。",
  tech: "dom",
  duration_hint: 60,
  z_hint: "top",
  tags: ["interview", "subtitle", "bilingual", "9x16"],
  default_theme: PRESET_NAME,
  themes: { [PRESET_NAME]: {} },
  params: {
    segments: {
      type: "array",
      default: [],
      label: "字幕段（fine.json.segments 直接贴）",
      group: "content",
    },
  },
  ai: {
    when: "9:16 访谈视频的双语字幕层。",
    how: "params.segments = fine.json.segments 直接贴，不要拍平成 SRT。",
    avoid: "不要把 segments 转换成 [{s,e,zh,en}] 格式——会导致英文字幕重复跳动。",
  },
};

// Speaker → color mapping
const SPEAKER_COLORS = {
  dario:     "#e8c47a",  // gold — main guest
  dwarkesh:  "#7ec8e3",  // blue — host
  default:   "#ffffff",
};

function speakerColor(speaker) {
  if (!speaker) return SPEAKER_COLORS.default;
  const key = speaker.toLowerCase().trim();
  return SPEAKER_COLORS[key] || SPEAKER_COLORS.default;
}

export function render(t, params, vp) {
  const preset = getPreset(PRESET_NAME);
  const colors = preset.colors || {};
  const layout = preset.layout || {};
  const type   = preset.type || {};
  const baseW = layout.baseW || 1080;
  const baseH = layout.baseH || 1920;

  const active = findActiveSub(params.segments, t);

  const subsTop  = scaleH(vp, layout.subs?.top  || 830, baseH);
  const subsLeft = scaleW(vp, layout.subs?.left  || 140, baseW);
  const subsRight = scaleW(vp, layout.subs?.right || 140, baseW);

  const cnSize  = scaleW(vp, type.cnSub?.size  || 52, baseW);
  const enSize  = scaleW(vp, type.enSub?.size  || 22, baseW);
  const cnLineH = type.cnSub?.lineHeight || 1.3;
  const enLineH = type.enSub?.lineHeight || 1.6;

  if (!active) {
    return `<div style="position:absolute;left:${subsLeft}px;right:${subsRight}px;top:${subsTop}px;"></div>`;
  }

  const cnColor = speakerColor(active.speaker);

  return `
    <div style="position:absolute;left:${subsLeft}px;right:${subsRight}px;top:${subsTop}px;">
      ${active.cn ? `<div style="font-family:${type.cnSub?.font || "system-ui,sans-serif"};font-size:${cnSize}px;font-weight:${type.cnSub?.weight || 700};line-height:${cnLineH};color:${cnColor};text-shadow:0 2px 8px rgba(0,0,0,0.8);">${esc(active.cn)}</div>` : ""}
      ${active.en ? `<div style="margin-top:${scaleH(vp, 12, baseH)}px;font-family:${type.enSub?.font || "system-ui,sans-serif"};font-size:${enSize}px;font-weight:${type.enSub?.weight || 400};font-style:italic;line-height:${enLineH};color:${colors.textDim || "rgba(255,255,255,0.7)"};text-shadow:0 1px 4px rgba(0,0,0,0.7);">${esc(active.en)}</div>` : ""}
    </div>
  `;
}

export function screenshots() {
  return [
    { t: 0.5, label: "sub-early" },
    { t: 10,  label: "sub-mid" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!Array.isArray(params.segments)) {
    errors.push("segments must be an array (fine.json.segments)");
  } else if (params.segments.length === 0) {
    errors.push("segments array is empty");
  }
  return { ok: errors.length === 0, errors };
}
