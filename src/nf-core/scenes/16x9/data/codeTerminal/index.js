import { getPreset, esc, scaleW, scaleH, fadeIn, clamp01 } from "../../../shared/design.js";

const PRESET_NAME = "lecture-warm";

const SAMPLE_NOTES = [
  { label: "Layer 1", text: "系统提示规定边界、工具和输出风格。" },
  { label: "Layer 2", text: "运行时再把 repo、命令结果、用户上下文拼进去。" },
  { label: "Layer 3", text: "模型决定是否调用工具，并把结果再反馈进下一轮。" },
];

const SAMPLE_CODE = `request
  -> load system prompt
  -> pack repo context
  -> expose tools
  -> run model loop
  -> emit final answer`;

function getParts() {
  const preset = getPreset(PRESET_NAME);
  return {
    colors: preset.colors || {},
    layout: preset.layout || {},
    type: preset.type || {},
  };
}

function escapeAttr(value) {
  return esc(value).replace(/'/g, "&#39;");
}

function highlightLine(line, colors) {
  const text = esc(line);
  if (line.trimStart().startsWith("//")) {
    return `<span style="color:${colors.comment};">${text}</span>`;
  }
  return text
    .replace(/\b(request|load|pack|expose|run|emit|if|else|return|const|await)\b/g, `<span style="color:${colors.accent};">$1</span>`)
    .replace(/\b(prompt|repo|context|tools|loop|answer)\b/g, `<span style="color:${colors.green};">$1</span>`)
    .replace(/(&quot;[^&]+&quot;)/g, `<span style="color:${colors.primary};">$1</span>`);
}

function renderCode(code, colors, revealCount) {
  const lines = String(code || "").split("\n");
  return lines.map((line, index) => {
    const visible = index < revealCount;
    const opacity = visible ? 1 : 0.18;
    const lineNum = String(index + 1).padStart(2, "0");
    return `<span style="display:block;opacity:${opacity};"><span style="color:${colors.comment};">${lineNum}</span>  ${highlightLine(line, colors)}</span>`;
  }).join("\n");
}

function normalizeNotes(value) {
  if (!Array.isArray(value)) return SAMPLE_NOTES;
  return value.filter(Boolean).slice(0, 4).map((item, index) => ({
    label: item.label || `Point ${index + 1}`,
    text: item.text || "",
  }));
}

export const meta = {
  id: "codeTerminal",
  version: 1,
  ratio: "16:9",
  category: "data",
  label: "Code Terminal",
  description: "左侧单个 pre 渲染代码，右侧说明面板补充架构讲解，适合 16:9 源码讲解视频。",
  tech: "dom",
  duration_hint: 14,
  loopable: false,
  z_hint: "middle",
  tags: ["code", "terminal", "architecture", "lecture"],
  mood: ["technical", "editorial", "focused"],
  theme: ["lecture-warm"],
  default_theme: PRESET_NAME,
  themes: {
    "lecture-warm": {},
    "lecture-soft": {},
    "lecture-contrast": {},
  },
  params: {
    windowTitle: { type: "string", default: "claude-code-architecture.txt", label: "终端标题", group: "content" },
    sectionTitle: { type: "string", default: "What actually gets sent to the model", label: "右侧标题", group: "content" },
    code: { type: "string", default: SAMPLE_CODE, label: "代码文本", group: "content" },
    notes: { type: "array", default: SAMPLE_NOTES, label: "右侧说明", group: "content" },
    footer: { type: "string", default: "Each turn is a packaged bundle, not just the line you typed.", label: "底部说明", group: "content" },
    codeReveal: { type: "number", default: 1, label: "代码显露进度", group: "timing", range: [0, 1], step: 0.01 },
  },
  ai: {
    when: "展示源码、配置或流程摘要，同时需要在画面右侧补充讲解时使用。",
    how: "code 传整段字符串；组件会用单个 pre 渲染左栏代码，并按 codeReveal 或当前时间逐步显露行数。",
    example: {
      windowTitle: "claude-code-architecture.txt",
      sectionTitle: "What actually gets sent to the model",
      code: SAMPLE_CODE,
      notes: SAMPLE_NOTES,
    },
    avoid: "不要把几十行细碎代码塞进去；如果必须展示更长代码，拆成多段 layer，避免单屏过密。",
    pairs_with: ["lectureChrome", "subtitleBar"],
  },
};

export function render(t, params, vp) {
  const { colors, layout, type } = getParts();
  const baseW = layout.baseW || 1920;
  const baseH = layout.baseH || 1080;
  const left = scaleW(vp, layout.codeArea?.left || 60, baseW);
  const top = scaleH(vp, layout.codeArea?.top || 100, baseH);
  const width = scaleW(vp, layout.codeArea?.width || 900, baseW);
  const height = scaleH(vp, layout.codeArea?.height || 820, baseH);
  const panelLeft = scaleW(vp, layout.panelArea?.left || 1000, baseW);
  const panelWidth = scaleW(vp, layout.panelArea?.width || 860, baseW);
  const panelHeight = scaleH(vp, layout.panelArea?.height || 820, baseH);
  const frameOpacity = fadeIn(t, 0.05, 0.45);
  const codeOpacity = fadeIn(t, 0.18, 0.55);
  const notesOpacity = fadeIn(t, 0.32, 0.55);
  const codeLines = String(params.code || "").split("\n");
  const reveal = params.codeReveal > 0 ? clamp01(params.codeReveal) : 0;
  const timeReveal = clamp01((t - 0.25) / 1.6);
  const revealCount = Math.max(1, Math.round(codeLines.length * Math.max(reveal, timeReveal)));
  const notes = normalizeNotes(params.notes);
  const codeHtml = renderCode(params.code, colors, revealCount);

  return `
    <div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;border-radius:${scaleW(vp, 20, baseW)}px;border:1px solid ${colors.textFaint};background:${colors.codeBg};box-shadow:0 ${scaleH(vp, 26, baseH)}px ${scaleW(vp, 64, baseW)}px ${colors.bg};overflow:hidden;opacity:${frameOpacity};">
      <div style="position:absolute;left:0;right:0;top:0;height:${scaleH(vp, 54, baseH)}px;background:${colors.bg};border-bottom:1px solid ${colors.textFaint};opacity:0.92;">
      </div>
      <div style="position:absolute;left:0;right:0;top:0;height:${scaleH(vp, 54, baseH)}px;">
        <div style="position:absolute;left:${scaleW(vp, 22, baseW)}px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:${scaleW(vp, 8, baseW)}px;">
          <span style="display:inline-block;width:${scaleW(vp, 9, baseW)}px;height:${scaleW(vp, 9, baseW)}px;border-radius:50%;background:${colors.red};"></span>
          <span style="display:inline-block;width:${scaleW(vp, 9, baseW)}px;height:${scaleW(vp, 9, baseW)}px;border-radius:50%;background:${colors.primary};"></span>
          <span style="display:inline-block;width:${scaleW(vp, 9, baseW)}px;height:${scaleW(vp, 9, baseW)}px;border-radius:50%;background:${colors.green};"></span>
        </div>
        <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-family:${type.chromeBrand?.font};font-size:${scaleW(vp, 14, baseW)}px;font-weight:${type.chromeBrand?.weight || 700};letter-spacing:0.08em;color:${colors.textDim};">
          ${esc(params.windowTitle)}
        </div>
      </div>

      <pre style="position:absolute;left:0;right:0;top:${scaleH(vp, 54, baseH)}px;bottom:0;margin:0;padding:${scaleH(vp, 28, baseH)}px ${scaleW(vp, 34, baseW)}px ${scaleH(vp, 32, baseH)}px ${scaleW(vp, 34, baseW)}px;font-family:${type.code?.font};font-size:${scaleW(vp, type.code?.size || 28, baseW)}px;font-weight:${type.code?.weight || 400};line-height:${type.code?.lineHeight || 1.7};color:${colors.text};white-space:pre-wrap;overflow:hidden;opacity:${codeOpacity};">${codeHtml}</pre>
    </div>

    <div style="position:absolute;left:${panelLeft}px;top:${top}px;width:${panelWidth}px;height:${panelHeight}px;border-radius:${scaleW(vp, 20, baseW)}px;border:1px solid ${colors.textFaint};background:${colors.bg};backdrop-filter:blur(${scaleW(vp, 14, baseW)}px);padding:${scaleH(vp, 34, baseH)}px ${scaleW(vp, 34, baseW)}px;opacity:${notesOpacity};">
      <div style="font-family:${type.panelTitle?.font};font-size:${scaleW(vp, type.panelTitle?.size || 42, baseW)}px;font-weight:${type.panelTitle?.weight || 700};line-height:${type.panelTitle?.lineHeight || 1.2};color:${colors.text};">
        ${esc(params.sectionTitle)}
      </div>
      <div style="margin-top:${scaleH(vp, 22, baseH)}px;display:flex;flex-direction:column;gap:${scaleH(vp, 20, baseH)}px;">
        ${notes.map((note, index) => `
          <div style="display:flex;gap:${scaleW(vp, 16, baseW)}px;align-items:flex-start;opacity:${clamp01((t - 0.45 - index * 0.12) / 0.32)};">
            <div style="flex:0 0 ${scaleW(vp, 104, baseW)}px;padding:${scaleH(vp, 6, baseH)}px ${scaleW(vp, 10, baseW)}px;border-radius:${scaleW(vp, 999, baseW)}px;border:1px solid ${colors.accent};background:${colors.codeBg};font-family:${type.chromeBrand?.font};font-size:${scaleW(vp, 13, baseW)}px;font-weight:${type.chromeBrand?.weight || 700};letter-spacing:0.08em;color:${colors.primary};text-transform:uppercase;text-align:center;">
              ${esc(note.label)}
            </div>
            <div style="font-family:${type.panelBody?.font};font-size:${scaleW(vp, type.panelBody?.size || 18, baseW)}px;font-weight:${type.panelBody?.weight || 400};line-height:${type.panelBody?.lineHeight || 1.7};color:${colors.textDim};">
              ${esc(note.text)}
            </div>
          </div>
        `).join("")}
      </div>
      <div style="position:absolute;left:${scaleW(vp, 34, baseW)}px;right:${scaleW(vp, 34, baseW)}px;bottom:${scaleH(vp, 32, baseH)}px;padding-top:${scaleH(vp, 18, baseH)}px;border-top:1px solid ${colors.textFaint};font-family:${type.panelBody?.font};font-size:${scaleW(vp, 17, baseW)}px;font-weight:${type.panelBody?.weight || 400};line-height:1.65;color:${colors.textFaint};">
        ${esc(params.footer)}
      </div>
    </div>
  `;
}

export function screenshots() {
  return [
    { t: 0.5, label: "terminal-shell" },
    { t: 2, label: "code-and-notes" },
    { t: 6, label: "fully-visible" },
  ];
}

export function lint(params) {
  const errors = [];
  if (!params.windowTitle) errors.push("windowTitle is required");
  if (!params.sectionTitle) errors.push("sectionTitle is required");
  if (!params.code || typeof params.code !== "string") errors.push("code must be a non-empty string");
  if (!Array.isArray(params.notes)) errors.push("notes must be an array");
  if (!params.footer) errors.push("footer is required");
  if (!Number.isFinite(params.codeReveal) || params.codeReveal < 0 || params.codeReveal > 1) {
    errors.push("codeReveal must be between 0 and 1");
  }
  return { ok: errors.length === 0, errors };
}
