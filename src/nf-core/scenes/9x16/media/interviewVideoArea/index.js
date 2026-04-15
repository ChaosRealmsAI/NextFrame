// interviewVideoArea — black video placeholder box; recorder overlays real video via ffmpeg
import { TOKENS, GRID, TYPE, scaleW, scaleH, esc } from "../../../shared/design.js";

export const meta = {
  id: "interviewVideoArea",
  version: 1,
  ratio: "9:16",
  category: "media",
  label: "Interview Video Area",
  description: "Black video placeholder box with clip label. Recorder uses meta.videoOverlay coords to composite actual video via ffmpeg.",
  tech: "dom",
  duration_hint: 60,
  videoOverlay: true,
  default_theme: "dark-interview",
  themes: { "dark-interview": {} },
  params: {
    src:        { type: "string",  default: "",  label: "Video file path (absolute)", group: "content", required: true },
    clipNum:    { type: "number",  default: 1,   label: "Clip number",  group: "content" },
    totalClips: { type: "number",  default: 1,   label: "Total clips",  group: "content" },
  },
  ai: {
    when: "Use for the interview video area — always pair with a videoOverlay in the timeline layer",
    how: "Pass src (absolute path to mp4), clipNum, totalClips. The timeline layer must also have videoOverlay: {x,y,w,h} for recorder to composite video correctly.",
  },
};

export function render(t, params, vp) {
  const { clipNum = 1, totalClips = 1 } = params;

  const gold = TOKENS.interview.gold;
  const bg = TOKENS.interview.bg;

  const left = scaleW(vp, GRID.video.left);
  const top = scaleH(vp, GRID.video.top);
  const right = scaleW(vp, GRID.video.right);
  const height = scaleH(vp, GRID.video.height);

  const clipLabel = totalClips > 1 ? `CLIP ${clipNum}/${totalClips}` : (clipNum > 1 ? `CLIP ${clipNum}` : "");
  const labelSize = scaleW(vp, TYPE.clipLabel.size);

  return `<div style="position:absolute;left:${left}px;right:${right}px;top:${top}px;height:${height}px;background:#000;border-radius:${scaleW(vp,4)}px;box-shadow:0 ${scaleH(vp,4)}px ${scaleH(vp,24)}px rgba(0,0,0,.4),inset 0 0 0 0.5px rgba(232,196,122,.08);overflow:hidden;pointer-events:none">
  ${clipLabel ? `<span style="position:absolute;top:${scaleH(vp,8)}px;left:${scaleW(vp,10)}px;z-index:20;font-size:${labelSize}px;color:rgba(232,196,122,.6);font-family:${TYPE.clipLabel.font};background:rgba(232,196,122,.08);padding:${scaleH(vp,2)}px ${scaleW(vp,6)}px;border-radius:${scaleW(vp,2)}px;letter-spacing:${TYPE.clipLabel.spacing}">${esc(clipLabel)}</span>` : ""}
</div>`;
}

export function screenshots() {
  return [
    { t: 0.5, label: "video area placeholder" },
    { t: 5,   label: "mid-clip" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!params.src) errors.push("src is required — absolute path to mp4");
  return { ok: errors.length === 0, errors };
}
