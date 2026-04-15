import { getPreset, esc, scaleW, scaleH } from "../../../shared/design.js";

const PRESET_NAME = "interview-dark";

export const meta = {
  id: "interviewVideoArea",
  version: 1,
  ratio: "9:16",
  category: "media",
  label: "Interview Video Area",
  description: "9:16 访谈视频嵌入框，recorder 用 ffmpeg 将真实视频叠加到此区域。",
  tech: "dom",
  duration_hint: 60,
  videoOverlay: true,
  z_hint: "mid",
  tags: ["interview", "video", "9x16"],
  default_theme: PRESET_NAME,
  themes: { [PRESET_NAME]: {} },
  params: {
    src:        { type: "string", default: "", label: "视频路径（绝对路径）", group: "media" },
    clipNum:    { type: "number", default: 1,  label: "当前片段号", group: "meta", range: [1, 99] },
    totalClips: { type: "number", default: 1,  label: "总片段数", group: "meta", range: [1, 99] },
  },
  ai: {
    when: "9:16 访谈视频中嵌入原始访谈画面。recorder 会用 ffmpeg 把真实视频叠加到这个区域。",
    how: "必须在 timeline layer 上加 videoOverlay 坐标，否则录制时视频全屏覆盖 UI。",
    avoid: "不要直接在 render 里放 <video> 标签；recorder 走 ffmpeg overlay，不是 HTML video。",
  },
};

export function render(t, params, vp) {
  const preset = getPreset(PRESET_NAME);
  const colors = preset.colors || {};
  const layout = preset.layout || {};
  const baseW = layout.baseW || 1080;
  const baseH = layout.baseH || 1920;

  const left   = scaleW(vp, layout.video?.left || 80, baseW);
  const top    = scaleH(vp, layout.video?.top  || 276, baseH);
  const w      = vp.width - left * 2;
  const h      = scaleH(vp, layout.video?.height || 538, baseH);

  const clipLabelSize = scaleW(vp, 14, baseW);

  const radius = scaleW(vp, 12, baseW);
  const rawSrc = params.src || "";
  const marker = rawSrc.indexOf("/projects/");
  const videoSrc = marker >= 0 ? "nfdata://localhost/" + encodeURI(rawSrc.slice(marker + "/projects/".length)) : rawSrc;

  return `
    <div style="position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;border-radius:${radius}px;overflow:hidden;background:#000;">
      ${videoSrc ? `<video src="${esc(videoSrc)}" style="width:100%;height:100%;object-fit:cover;display:block;" muted playsinline data-nf-persist="true"></video>` : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0.18;">
        <div style="font-family:'SF Mono','JetBrains Mono',monospace;font-size:${clipLabelSize}px;font-weight:500;letter-spacing:0.08em;color:${colors.primary || "#e8c47a"};text-transform:uppercase;">VIDEO CLIP ${esc(String(params.clipNum || 1))} / ${esc(String(params.totalClips || 1))}</div>
      </div>`}
      <div style="position:absolute;inset:0;border-radius:${radius}px;border:1px solid rgba(232,196,122,0.12);pointer-events:none;"></div>
    </div>
  `;
}

export function screenshots() {
  return [{ t: 0.5, label: "video-placeholder" }];
}

export function lint(params) {
  const errors = [];
  if (!params.src) errors.push("src (video path) is required");
  return { ok: errors.length === 0, errors };
}
