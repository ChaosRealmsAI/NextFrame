import { TOKENS, GRID, TYPE, esc, scaleW, scaleH } from "../../../shared/design.js";

// Speaker → Chinese text color map
const SPEAKER_COLORS = {
  dario: TOKENS.interview.gold,
  dwarkesh: TOKENS.interview.text,
};

function speakerColor(speaker) {
  const key = typeof speaker === "string" ? speaker.toLowerCase() : "";
  return SPEAKER_COLORS[key] || TOKENS.interview.text;
}

export const meta = {
  id: "interviewBiSub",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Bilingual Subtitles",
  description: "时间同步中英双语字幕。支持逐条 SRT 数组（按时间戳切换）或静态文本回退。说话人颜色区分。",
  tech: "html",
  videoOverlay: false,
  duration_hint: 0,
  loopable: true,
  z_hint: "top",
  tags: ["subtitle", "bilingual", "interview", "srt", "9:16"],
  mood: ["neutral", "informative"],
  theme: ["interview", "education", "presentation"],
  params: {
    srt: {
      type: "array",
      default: [],
      label: "字幕数组",
      semantic: "srt — array of {s,e,zh,en,speaker} — s/e in seconds; s=start, e=end, zh=Chinese text, en=English text, speaker=speaker id",
      group: "content",
    },
    zh: {
      type: "string",
      default: "",
      label: "中文字幕（静态）",
      semantic: "fallback Chinese subtitle shown when srt is empty or no entry matches current time",
      group: "content",
    },
    en: {
      type: "string",
      default: "",
      label: "英文字幕（静态）",
      semantic: "fallback English subtitle shown when srt is empty or no entry matches current time",
      group: "content",
    },
    speaker: {
      type: "string",
      default: "",
      label: "说话人（静态）",
      semantic: "static speaker id used for fallback zh/en; 'dario' gets gold color, 'dwarkesh' gets white",
      group: "content",
    },
  },
  ai: {
    when: "访谈字幕区 — 在视频下方显示中英双语同步字幕。",
    how: "传 srt 数组时，render 按 t 找到 s<=t<e 的条目显示；无匹配时显示 zh/en 静态回退。speaker 控制中文颜色。",
    example: {
      srt: [
        { s: 0, e: 3.5, zh: "我认为 AI 会改变一切", en: "I think AI will change everything", speaker: "dario" },
        { s: 3.5, e: 7.0, zh: "你是什么时候意识到这一点的？", en: "When did you realize that?", speaker: "dwarkesh" },
      ],
    },
    avoid: "srt 条目的 s/e 单位是秒；不要传毫秒。speaker 大小写不敏感。",
    pairs_with: ["interviewVideoArea", "interviewHeader", "interviewBrand"],
  },
};

export function render(t, params, vp) {
  const currentTime = Math.max(0, Number.isFinite(t) ? t : 0);

  // Resolve active subtitle entry
  let zhText = typeof params.zh === "string" ? params.zh : "";
  let enText = typeof params.en === "string" ? params.en : "";
  let activeSpeaker = typeof params.speaker === "string" ? params.speaker : "";

  if (Array.isArray(params.srt) && params.srt.length > 0) {
    const entry = params.srt.find(
      (item) =>
        item &&
        Number.isFinite(item.s) &&
        Number.isFinite(item.e) &&
        currentTime >= item.s &&
        currentTime < item.e
    );
    if (entry) {
      zhText = typeof entry.zh === "string" ? entry.zh : "";
      enText = typeof entry.en === "string" ? entry.en : "";
      activeSpeaker = typeof entry.speaker === "string" ? entry.speaker : activeSpeaker;
    }
  }

  // Layout — derived from GRID.subs at 1080×1920
  const left = scaleW(vp, GRID.subs.left);
  const top = scaleH(vp, GRID.subs.top);
  const width = vp.width - scaleW(vp, GRID.subs.left) - scaleW(vp, GRID.subs.right);
  const height = scaleH(vp, GRID.subs.height);

  // Typography
  const cnSize = scaleW(vp, TYPE.cnSub.size);
  const enSize = scaleW(vp, TYPE.enSub.size);
  const cnColor = speakerColor(activeSpeaker);
  const enColor = "rgba(255,255,255,0.45)";
  const cnShadow = "0 1px 8px rgba(0,0,0,0.4)";
  const cnGap = scaleH(vp, 16);

  // Only render if there is text
  if (!zhText && !enText) {
    return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;height:${vp.height}px;pointer-events:none"></div>`;
  }

  let cnBlock = "";
  if (zhText) {
    cnBlock = `<div style="` +
      `font-family:${TYPE.cnSub.font};` +
      `font-size:${cnSize}px;` +
      `font-weight:${TYPE.cnSub.weight};` +
      `line-height:${TYPE.cnSub.lineHeight};` +
      `color:${cnColor};` +
      `text-shadow:${cnShadow};` +
      `margin-bottom:${cnGap}px;` +
      `word-break:break-all;` +
      `">${esc(zhText)}</div>`;
  }

  let enBlock = "";
  if (enText) {
    enBlock = `<div style="` +
      `font-family:${TYPE.enSub.font};` +
      `font-size:${enSize}px;` +
      `font-weight:${TYPE.enSub.weight};` +
      `font-style:italic;` +
      `line-height:${TYPE.enSub.lineHeight};` +
      `color:${enColor};` +
      `word-break:break-word;` +
      `">${esc(enText)}</div>`;
  }

  return `<div style="position:absolute;left:0;top:0;width:${vp.width}px;height:${vp.height}px;pointer-events:none">` +
    `<div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-start">` +
    cnBlock +
    enBlock +
    `</div>` +
    `</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "字幕起始状态" },
    { t: 2, label: "字幕显示中" },
    { t: 5, label: "字幕切换后" },
  ];
}

export function lint(params, vp) {
  const errors = [];

  if (params.srt !== undefined && !Array.isArray(params.srt)) {
    errors.push("srt 必须是数组。Fix: 传入 [{s, e, zh, en, speaker}, ...] 格式的数组，或省略此参数");
  }

  if (Array.isArray(params.srt)) {
    params.srt.forEach((item, i) => {
      if (!item || typeof item !== "object") {
        errors.push(`srt[${i}] 必须是对象 {s, e, zh, en, speaker}`);
        return;
      }
      if (!Number.isFinite(item.s)) {
        errors.push(`srt[${i}].s 必须是数字（秒）。Fix: 如 s: 1.5`);
      }
      if (!Number.isFinite(item.e)) {
        errors.push(`srt[${i}].e 必须是数字（秒）。Fix: 如 e: 3.0`);
      }
      if (Number.isFinite(item.s) && Number.isFinite(item.e) && item.s >= item.e) {
        errors.push(`srt[${i}] s(${item.s}) 必须小于 e(${item.e})。Fix: 确保 s < e`);
      }
      if (item.zh !== undefined && typeof item.zh !== "string") {
        errors.push(`srt[${i}].zh 必须是字符串`);
      }
      if (item.en !== undefined && typeof item.en !== "string") {
        errors.push(`srt[${i}].en 必须是字符串`);
      }
    });
  }

  if (params.zh !== undefined && typeof params.zh !== "string") {
    errors.push("zh 必须是字符串。Fix: 传入中文字幕文本");
  }
  if (params.en !== undefined && typeof params.en !== "string") {
    errors.push("en 必须是字符串。Fix: 传入英文字幕文本");
  }
  if (!vp || !Number.isFinite(vp.width) || !Number.isFinite(vp.height)) {
    errors.push("vp 无效：需要 { width, height }");
  }

  return { ok: errors.length === 0, errors };
}
