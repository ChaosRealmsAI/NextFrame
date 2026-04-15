window.__scenes = window.__scenes || {};

// NextFrame Shared Design System
// Shared utilities + named presets. Scenes pick a color/layout/type preset by name.
// Adding a new series = adding a new preset, no changes to utility functions.

// ═══════════════════════════════════════════════════════════════
// 1. PRESETS — named bundles of color palette + layout grid + typography
//    Scenes call getPreset(name) to load, or override via params
// ═══════════════════════════════════════════════════════════════
const PRESETS = {
  // ── 硅谷访谈 9:16 ──
  "interview-dark": {
    colors: {
      bg: "#111111",
      primary: "#e8c47a",      // gold
      accent: "#da7756",       // warm orange
      text: "#ffffff",
      textDim: "rgba(255,255,255,0.7)",
      textFaint: "rgba(255,255,255,0.3)",
      blue: "#7ec8e3",
      tagBg: "rgba(126,200,227,0.06)",
      tagBorder: "rgba(126,200,227,0.15)",
      tagText: "#7ec8e3",
      decoLine: "rgba(232,196,122,0.12)",
      decoLineDiamond: "rgba(232,196,122,0.2)",
      gridDot: "rgba(232,196,122,0.08)",
      glowTop: "rgba(232,196,122,0.03)",
      glowBottom: "rgba(232,196,122,0.02)",
      vignette: "rgba(17,17,17,0.5)",
    },
    // 布局: 1080×1920 参考画布的绝对 px
    layout: {
      baseW: 1080, baseH: 1920,
      sidePad: 80,
      header: { top: 0, height: 260 },
      decoLine1: 258,
      video: { top: 276, height: 538, left: 80, right: 80 },
      decoLine2: 820,
      subs: { top: 830, left: 140, right: 140, height: 340 },
      timeInfo: 1186,
      topic: { top: 1224, height: 256 },
      progress: 1496,
      decoLine3: 1580,
      brand: 1590,
      teamLine: 1760,
    },
    type: {
      seriesName: { size: 44, weight: 800, spacing: "0.06em", font: "'PingFang SC','Noto Sans SC',Inter,system-ui,sans-serif" },
      title:      { size: 60, weight: 700, spacing: "-0.01em", lineHeight: 1.2, font: "'PingFang SC','Noto Sans SC',Inter,system-ui,sans-serif" },
      cnSub:      { size: 52, weight: 700, lineHeight: 1.3, font: "-apple-system,'PingFang SC','Microsoft YaHei',system-ui,sans-serif" },
      enSub:      { size: 22, weight: 400, lineHeight: 1.6, font: "-apple-system,'PingFang SC',system-ui,sans-serif" },
      topicLabel: { size: 20, weight: 600, spacing: "0.1em", font: "'PingFang SC','Noto Sans SC',sans-serif" },
      topicText:  { size: 24, weight: 500, lineHeight: 1.65, font: "'PingFang SC','Noto Sans SC',sans-serif" },
      tag:        { size: 22, weight: 500, spacing: "0.03em", font: "'SF Mono','JetBrains Mono',monospace" },
      timeInfo:   { size: 22, weight: 500, spacing: "0.05em", font: "'SF Mono','JetBrains Mono',monospace" },
      brand:      { size: 40, weight: 900, spacing: "0.2em", font: "'Iowan Old Style','Songti SC','Playfair Display',Georgia,serif" },
      teamLine:   { size: 20, weight: 500, spacing: "0.03em", font: "'SF Mono','JetBrains Mono',monospace" },
      clipLabel:  { size: 14, weight: 500, spacing: "0.08em", font: "'SF Mono','JetBrains Mono',monospace" },
    },
  },

  // ── 讲解视频 16:9 ──
  "lecture-warm": {
    colors: {
      bg: "#1a1510",
      primary: "#d4b483",      // warm gold
      accent: "#da7756",
      text: "#f5ece0",
      textDim: "rgba(245,236,224,0.6)",
      textFaint: "rgba(245,236,224,0.3)",
      green: "#7ec699",
      codeBg: "#1e1e2e",
      comment: "#6a6a7a",
      red: "#e06c75",
    },
    layout: {
      baseW: 1920, baseH: 1080,
      sidePad: 60,
      topPad: 40,
      chrome: { top: 0, height: 48 },
      content: { top: 80, left: 60, right: 60, height: 860 },
      codeArea: { top: 100, left: 60, width: 900, height: 820 },
      panelArea: { top: 100, left: 1000, width: 860, height: 820 },
      subtitle: { bottom: 60, left: 120, right: 120, height: 80 },
      progress: { bottom: 0, height: 4 },
      headline: { top: 340, left: 120, right: 120 },
    },
    type: {
      headline:      { size: 72, weight: 800, lineHeight: 1.15, font: "Georgia,'Noto Serif SC',serif" },
      subtitle:      { size: 32, weight: 500, lineHeight: 1.5, font: "system-ui,sans-serif" },
      code:          { size: 28, weight: 400, lineHeight: 1.7, font: "'SF Mono',Menlo,monospace" },
      panelTitle:    { size: 42, weight: 700, lineHeight: 1.2, font: "Georgia,'Noto Serif SC',serif" },
      panelBody:     { size: 18, weight: 400, lineHeight: 1.7, font: "system-ui,sans-serif" },
      chromeBrand:   { size: 16, weight: 700, spacing: "0.04em", font: "system-ui,sans-serif" },
      srtText:       { size: 32, weight: 500, lineHeight: 1.5, font: "system-ui,sans-serif" },
      flowNode:      { size: 28, weight: 600, font: "system-ui,sans-serif" },
    },
  },
};

/**
 * 获取预设。scene 用这个拿色板/布局/字号。
 * 找不到返回空对象，scene 用自己的 params 兜底。
 */
function getPreset(name) {
  return PRESETS[name] || {};
}

// ═══════════════════════════════════════════════════════════════
// 2. UTILITIES — 通用工具函数，不绑定任何预设
// ═══════════════════════════════════════════════════════════════
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escAttr(value) {
  return esc(value).replace(/'/g, "&#39;");
}
function clamp01(value) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}
function easeOutCubic(value) {
  const p = clamp01(value);
  return 1 - Math.pow(1 - p, 3);
}

/** 按参考画布缩放像素值。baseW/baseH 从 preset.layout 取。 */
function scale(vp, px, base) {
  return Math.round((vp.width * px) / (base || 1080));
}
function scaleW(vp, px, baseW) {
  return Math.round((vp.width * px) / (baseW || 1080));
}
function scaleH(vp, px, baseH) {
  return Math.round((vp.height * px) / (baseH || 1920));
}
function fadeIn(t, delay, duration) {
  const d = Number.isFinite(delay) ? delay : 0;
  const dur = Number.isFinite(duration) ? duration : 0.45;
  return easeOutCubic((t - d) / Math.max(dur, 0.001));
}

// ═══════════════════════════════════════════════════════════════
// 3. SUBTITLE — 两级查找（通用，不绑定预设）
// ═══════════════════════════════════════════════════════════════

// Schema: params.segments = fine.json.segments (array)
//   segment: { s, e, speaker, en, cn: [{ text, s, e }] }
// Two-level: segment → EN + speaker, cn[] → CN text
function findActiveSub(segments, t) {
  if (!Array.isArray(segments)) return null;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (t >= seg.s && t < seg.e) {
      const cnArr = Array.isArray(seg.cn) ? seg.cn : [];
      for (let j = 0; j < cnArr.length; j++) {
        const c = cnArr[j];
        if (t >= c.s && t < c.e) {
          return { en: seg.en || "", cn: c.text || "", speaker: seg.speaker || "" };
        }
      }
      return { en: seg.en || "", cn: "", speaker: seg.speaker || "" };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// 4. DECORATIVE HELPERS — 通用装饰元素（接受颜色参数）
// ═══════════════════════════════════════════════════════════════

/** 渲染装饰分隔线 + 菱形端点。颜色从外部传入。 */
function decoLine(vp, y, colors, baseW, baseH) {
  const lineColor = colors?.decoLine || "rgba(232,196,122,0.12)";
  const diamondColor = colors?.decoLineDiamond || "rgba(232,196,122,0.2)";
  const bgColor = colors?.bg || "#111";
  const left = scaleW(vp, 80, baseW);
  const lineY = scaleH(vp, y, baseH);
  const dSize = scaleW(vp, 10, baseW);
  return `<div style="position:absolute;left:${left}px;right:${left}px;top:${lineY}px;height:1px;background:linear-gradient(90deg,transparent,${lineColor} 20%,${lineColor} 80%,transparent);pointer-events:none">` +
    `<div style="position:absolute;left:0;top:${-dSize/2}px;width:${dSize}px;height:${dSize}px;border:1px solid ${diamondColor};transform:rotate(45deg);background:${bgColor}"></div>` +
    `<div style="position:absolute;right:0;top:${-dSize/2}px;width:${dSize}px;height:${dSize}px;border:1px solid ${diamondColor};transform:rotate(45deg);background:${bgColor}"></div>` +
    `</div>`;
}

// ═══════════════════════════════════════════════════════════════
// 5. BACKWARD COMPAT — 旧代码的快捷引用（逐步废弃）
// ═══════════════════════════════════════════════════════════════

// 旧代码用 TOKENS.interview.gold 等。保留兼容但新代码用 getPreset()。
const TOKENS = {
  interview: PRESETS["interview-dark"]?.colors || {},
  lecture: PRESETS["lecture-warm"]?.colors || {},
};
const GRID = PRESETS["interview-dark"]?.layout || {};
const TYPE = PRESETS["interview-dark"]?.type || {};
const GRID_16x9 = PRESETS["lecture-warm"]?.layout || {};
const TYPE_16x9 = PRESETS["lecture-warm"]?.type || {};


(function(){

const PRESET_NAME = "interview-dark";

const SAMPLE_TAGS = [
  "Dwarkesh Podcast",
  "Dario Amodei",
  "原声 1:21",
];

function defaultTags(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string") return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function getPresetParts() {
  const preset = getPreset(PRESET_NAME);
  return {
    colors: preset.colors || {},
    layout: preset.layout || {},
    type: preset.type || {},
  };
}
const meta = {
  id: "interviewChrome",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Interview Chrome",
  description: "Static portrait interview baseplate with background, title, metadata, brand, and decorative lines.",
  tech: "dom",
  duration_hint: 81,
  tags: ["interview", "portrait", "chrome"],
  mood: ["editorial"],
  theme: ["interview-dark"],
  default_theme: PRESET_NAME,
  themes: {
    "interview-dark": {},
    "interview-soft": {},
    "interview-contrast": {},
  },
  params: {
    seriesName: { type: "string", default: "速通硅谷访谈 · E01 · Dario Amodei", label: "系列名", group: "content" },
    title: { type: "string", default: "指数快到头了，大众浑然不知", label: "标题", group: "content" },
    clipLabel: { type: "string", default: "CLIP 01", label: "片段标签", group: "content" },
    origRange: { type: "string", default: "原片 2:22:19 ｜ 内容来源：00:00 — 01:21", label: "原片范围", group: "meta" },
    topicLabel: { type: "string", default: "正在聊", label: "话题标签", group: "meta" },
    topic: { type: "string", default: "Anthropic 的指数曲线为什么还没到头，以及社会为什么几乎没意识到这一点。", label: "话题", group: "meta" },
    tags: { type: "array", default: SAMPLE_TAGS, label: "标签", group: "meta" },
    brand: { type: "string", default: "NEXTFRAME", label: "品牌", group: "brand" },
    teamLine: { type: "string", default: "Produced by NextFrame AI-native video pipeline", label: "团队签名", group: "brand" },
  },
  ai: {
    when: "Use as the static chrome layer for a 9:16 interview clip.",
    how: "Pair with interviewVideoArea, interviewBiSub, and progressBar9x16 for a complete portrait interview timeline.",
    example: {},
    avoid: "Do not use for layouts that need changing title blocks or dynamic metadata over time.",
    pairs_with: ["interviewVideoArea", "interviewBiSub", "progressBar9x16"],
  },
};
function render(t, params, vp) {
  const { colors, layout, type } = getPresetParts();
  const sidePad = scaleW(vp, layout.sidePad, layout.baseW);
  const headerTop = scaleH(vp, layout.header.top, layout.baseH);
  const headerHeight = scaleH(vp, layout.header.height, layout.baseH);
  const topicTop = scaleH(vp, layout.topic.top, layout.baseH);
  const topicHeight = scaleH(vp, layout.topic.height, layout.baseH);
  const timeInfoTop = scaleH(vp, layout.timeInfo, layout.baseH);
  const brandTop = scaleH(vp, layout.brand, layout.baseH);
  const teamTop = scaleH(vp, layout.teamLine, layout.baseH);
  const titleSize = scaleW(vp, type.title.size, layout.baseW);
  const seriesSize = scaleW(vp, type.seriesName.size, layout.baseW);
  const topicLabelSize = scaleW(vp, type.topicLabel.size, layout.baseW);
  const topicTextSize = scaleW(vp, type.topicText.size, layout.baseW);
  const tagSize = scaleW(vp, type.tag.size, layout.baseW);
  const timeInfoSize = scaleW(vp, type.timeInfo.size, layout.baseW);
  const brandSize = scaleW(vp, type.brand.size, layout.baseW);
  const teamSize = scaleW(vp, type.teamLine.size, layout.baseW);
  const dotSize = Math.max(2, scaleW(vp, 2, layout.baseW));
  const gridSize = Math.max(16, scaleW(vp, 20, layout.baseW));
  const tagList = defaultTags(params.tags).slice(0, 3);

  return `
    <div style="position:absolute;inset:0;overflow:hidden;background:${colors.bg};">
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse at 50% 18%, ${colors.glowTop} 0%, transparent 58%),
        radial-gradient(ellipse at 50% 82%, ${colors.glowBottom} 0%, transparent 52%);
      "></div>
      <div style="position:absolute;inset:0;opacity:0.9;background:
        radial-gradient(ellipse at 50% 45%, transparent 38%, ${colors.vignette} 100%);
      "></div>
      <div style="position:absolute;inset:0;opacity:1;background-image:radial-gradient(${colors.gridDot} ${dotSize}px, transparent ${dotSize}px);background-size:${gridSize}px ${gridSize}px;"></div>

      <div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${headerTop}px;height:${headerHeight}px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding-bottom:${scaleH(vp, 22, layout.baseH)}px;text-align:center;">
        <div style="font-family:${type.seriesName.font};font-size:${seriesSize}px;font-weight:${type.seriesName.weight};letter-spacing:${type.seriesName.spacing};color:${colors.primary};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">
          ${esc(params.seriesName)}
        </div>
        <div style="margin-top:${scaleH(vp, 12, layout.baseH)}px;font-family:${type.title.font};font-size:${titleSize}px;font-weight:${type.title.weight};letter-spacing:${type.title.spacing};line-height:${type.title.lineHeight};color:${colors.text};max-width:100%;">
          ${esc(params.title)}
        </div>
      </div>

      ${decoLine(vp, layout.decoLine1, colors, layout.baseW, layout.baseH)}
      ${decoLine(vp, layout.decoLine2, colors, layout.baseW, layout.baseH)}
      ${decoLine(vp, layout.decoLine3, colors, layout.baseW, layout.baseH)}

      <div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${timeInfoTop}px;text-align:center;font-family:${type.timeInfo.font};font-size:${timeInfoSize}px;font-weight:${type.timeInfo.weight};letter-spacing:${type.timeInfo.spacing};color:${colors.primary};opacity:0.68;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${esc(params.origRange)}
      </div>

      <div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${topicTop}px;height:${topicHeight}px;">
        <div style="display:flex;align-items:center;gap:${scaleW(vp, 18, layout.baseW)}px;font-family:${type.topicLabel.font};font-size:${topicLabelSize}px;font-weight:${type.topicLabel.weight};letter-spacing:${type.topicLabel.spacing};color:${colors.primary};text-transform:uppercase;">
          <span>${esc(params.topicLabel)}</span>
          <span style="flex:1;height:1px;background:linear-gradient(90deg, ${colors.primary}, transparent);opacity:0.3;"></span>
        </div>
        <div style="margin-top:${scaleH(vp, 16, layout.baseH)}px;font-family:${type.topicText.font};font-size:${topicTextSize}px;font-weight:${type.topicText.weight};line-height:${type.topicText.lineHeight};color:${colors.textDim};">
          ${esc(params.topic)}
        </div>
        <div style="margin-top:${scaleH(vp, 22, layout.baseH)}px;display:flex;justify-content:center;gap:${scaleW(vp, 14, layout.baseW)}px;flex-wrap:nowrap;overflow:hidden;">
          ${tagList.map((tag) => `
            <span style="display:inline-flex;align-items:center;padding:${scaleH(vp, 9, layout.baseH)}px ${scaleW(vp, 18, layout.baseW)}px;border:1px solid ${colors.tagBorder};border-radius:${scaleW(vp, 10, layout.baseW)}px;background:${colors.tagBg};font-family:${type.tag.font};font-size:${tagSize}px;font-weight:${type.tag.weight};letter-spacing:${type.tag.spacing};color:${colors.tagText};white-space:nowrap;">
              ${esc(tag)}
            </span>
          `).join("")}
        </div>
      </div>

      <div style="position:absolute;left:${sidePad}px;top:${scaleH(vp, layout.video.top + 18, layout.baseH)}px;padding:${scaleH(vp, 6, layout.baseH)}px ${scaleW(vp, 12, layout.baseW)}px;border:1px solid ${colors.tagBorder};border-radius:${scaleW(vp, 8, layout.baseW)}px;background:${colors.tagBg};font-family:${type.clipLabel.font};font-size:${scaleW(vp, type.clipLabel.size, layout.baseW)}px;font-weight:${type.clipLabel.weight};letter-spacing:${type.clipLabel.spacing};color:${colors.primary};">
        ${esc(params.clipLabel)}
      </div>

      <div style="position:absolute;left:0;right:0;top:${brandTop}px;text-align:center;font-family:${type.brand.font};font-size:${brandSize}px;font-weight:${type.brand.weight};letter-spacing:${type.brand.spacing};color:${colors.primary};">
        ${esc(params.brand)}
      </div>
      <div style="position:absolute;left:${sidePad}px;right:${sidePad}px;top:${teamTop}px;text-align:center;font-family:${type.teamLine.font};font-size:${teamSize}px;font-weight:${type.teamLine.weight};letter-spacing:${type.teamLine.spacing};color:${colors.textFaint};">
        ${esc(params.teamLine)}
      </div>
    </div>
  `;
}
function screenshots() {
  return [
    { t: 0.5, label: "opening" },
    { t: 5, label: "title-and-meta" },
    { t: 40, label: "brand-zone" },
  ];
}
function lint(params) {
  const errors = [];
  if (!params.seriesName) errors.push("seriesName is required");
  if (!params.title) errors.push("title is required");
  if (!params.brand) errors.push("brand is required");
  if (!Array.isArray(params.tags) && typeof params.tags !== "string") {
    errors.push("tags must be an array or comma-separated string");
  }
  return { ok: errors.length === 0, errors };
}

window.__scenes["interviewChrome"] = { render, meta: typeof meta !== "undefined" ? meta : null };
})();

(function(){

const PRESET_NAME = "interview-dark";
const meta = {
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
function render(t, params, vp) {
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
      ${videoSrc ? `<video src="${esc(videoSrc)}" style="width:100%;height:100%;object-fit:cover;display:block;background:#000;" muted playsinline preload="auto" data-nf-persist="interview-video"></video>` : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0.18;">
        <div style="font-family:'SF Mono','JetBrains Mono',monospace;font-size:${clipLabelSize}px;font-weight:500;letter-spacing:0.08em;color:${colors.primary || "#e8c47a"};text-transform:uppercase;">VIDEO CLIP ${esc(String(params.clipNum || 1))} / ${esc(String(params.totalClips || 1))}</div>
      </div>`}
      <div style="position:absolute;inset:0;border-radius:${radius}px;border:1px solid rgba(232,196,122,0.12);pointer-events:none;"></div>
    </div>
  `;
}
function screenshots() {
  return [{ t: 0.5, label: "video-placeholder" }];
}
function lint(params) {
  const errors = [];
  if (!params.src) errors.push("src (video path) is required");
  return { ok: errors.length === 0, errors };
}

window.__scenes["interviewVideoArea"] = { render, meta: typeof meta !== "undefined" ? meta : null };
})();

(function(){

const PRESET_NAME = "interview-dark";
const meta = {
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
function render(t, params, vp) {
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
function screenshots() {
  return [
    { t: 0.5, label: "sub-early" },
    { t: 10,  label: "sub-mid" },
  ];
}
function lint(params) {
  const errors = [];
  if (!Array.isArray(params.segments)) {
    errors.push("segments must be an array (fine.json.segments)");
  } else if (params.segments.length === 0) {
    errors.push("segments array is empty");
  }
  return { ok: errors.length === 0, errors };
}

window.__scenes["interviewBiSub"] = { render, meta: typeof meta !== "undefined" ? meta : null };
})();

(function(){

const PRESET_NAME = "interview-dark";
const meta = {
  id: "progressBar9x16",
  version: 1,
  ratio: "9:16",
  category: "overlays",
  label: "Progress Bar 9:16",
  description: "9:16 访谈视频进度条，位于字幕区和品牌区之间。",
  tech: "dom",
  duration_hint: 60,
  z_hint: "top",
  tags: ["interview", "progress", "9x16"],
  default_theme: PRESET_NAME,
  themes: { [PRESET_NAME]: {} },
  params: {
    duration: { type: "number", default: 60, label: "总时长（秒）", group: "timing", range: [1, 600] },
  },
  ai: {
    when: "9:16 访谈视频进度条，放在 meta/字幕区下方。",
    how: "duration 传视频总时长，进度条自动跟进。",
  },
};
function render(t, params, vp) {
  const preset = getPreset(PRESET_NAME);
  const colors = preset.colors || {};
  const layout = preset.layout || {};
  const baseW = layout.baseW || 1080;
  const baseH = layout.baseH || 1920;

  const dur = Number.isFinite(params.duration) && params.duration > 0 ? params.duration : 60;
  const progress = clamp01(t / dur);

  const progressY   = scaleH(vp, layout.progress || 1496, baseH);
  const sidePad     = scaleW(vp, layout.sidePad || 80, baseW);
  const barH        = Math.max(2, scaleH(vp, 4, baseH));
  const knobSize    = Math.max(6, scaleW(vp, 12, baseW));
  const trackWidth  = vp.width - sidePad * 2;
  const filled      = Math.round(progress * trackWidth);

  return `
    <div style="position:absolute;left:${sidePad}px;top:${progressY}px;width:${trackWidth}px;">
      <div style="position:relative;height:${barH}px;background:${colors.textFaint || "rgba(255,255,255,0.3)"};border-radius:${barH}px;overflow:hidden;">
        <div style="position:absolute;left:0;top:0;height:100%;width:${filled}px;background:linear-gradient(90deg,${colors.accent || "#da7756"},${colors.primary || "#e8c47a"});border-radius:${barH}px;box-shadow:0 0 ${scaleW(vp, 10, baseW)}px ${colors.primary || "#e8c47a"};"></div>
      </div>
      <div style="position:absolute;left:${Math.max(0, filled - knobSize / 2)}px;top:${-(knobSize - barH) / 2}px;width:${knobSize}px;height:${knobSize}px;border-radius:50%;background:${colors.primary || "#e8c47a"};box-shadow:0 0 ${scaleW(vp, 8, baseW)}px ${colors.primary || "#e8c47a"};"></div>
    </div>
  `;
}
function screenshots() {
  return [
    { t: 0.5,  label: "start" },
    { t: 30,   label: "half" },
    { t: 59.5, label: "end" },
  ];
}
function lint(params) {
  const errors = [];
  if (!Number.isFinite(params.duration) || params.duration <= 0) {
    errors.push("duration must be a positive number");
  }
  return { ok: errors.length === 0, errors };
}

window.__scenes["progressBar9x16"] = { render, meta: typeof meta !== "undefined" ? meta : null };
})();
