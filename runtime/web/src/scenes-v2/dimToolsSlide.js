import {
  createRoot, createNode, smoothstep, easeOutCubic, easeOutBack,
} from "../scenes-v2-shared.js";

// dimToolsSlide — 1:1 replica of Claude Code 源码讲解 "维度6：工具箱" slide
// Phase 1 (0-0.35): brand bar, title row, code window with JSON schema, tool name chips
// Phase 2 (0.35-1.0): MCP card + Deferred card + "100+" big number
// type: "dom"

const C = {
  bg: "#1a1510",
  bg2: "#211c15",
  ink: "#f5ece0",
  ink75: "rgba(245,236,224,.75)",
  ink50: "rgba(245,236,224,.50)",
  ink30: "rgba(245,236,224,.30)",
  ink15: "rgba(245,236,224,.15)",
  ac: "#da7756",
  ac10: "rgba(218,119,86,.10)",
  ac25: "rgba(218,119,86,.25)",
  ac40: "rgba(218,119,86,.40)",
  gold: "#d4b483",
  gold20: "rgba(212,180,131,.20)",
  green: "#7ec699",
  green20: "rgba(126,198,153,.20)",
  blue: "#8ab4cc",
  red: "#e06c75",
  mono: '"SF Mono", Menlo, monospace',
  serif: 'Georgia, "Playfair Display", serif',
  sans: 'system-ui, -apple-system, sans-serif',
  // Code syntax colors
  codeKey: "#ff7b72",
  codeStr: "#7ee787",
  codeNum: "#ffa657",
  codeBrace: "rgba(245,236,224,.5)",
  codeComment: "rgba(245,236,224,.3)",
};

function mk(tag, css, text) {
  const el = document.createElement(tag);
  if (css) el.style.cssText = css;
  if (text !== undefined) el.textContent = text;
  return el;
}

function ap(parent, ...children) {
  for (const c of children) parent.appendChild(c);
  return parent;
}

// Subtitle timeline
const SUBS = [
  { start: 0.00, end: 0.12, text: "第六个，工具箱。放在 tools 这个槽位里。" },
  { start: 0.12, end: 0.26, text: "内置 20 多个——Bash、Read、Edit、Grep、Agent、Skill——" },
  { start: 0.26, end: 0.38, text: "每个工具是一份完整的 JSON Schema 说明书。" },
  { start: 0.39, end: 0.52, text: "如果你接了 MCP 服务器，MCP 提供的工具也会加进来。" },
  { start: 0.52, end: 0.70, text: "还有一类叫 Deferred 工具——只发个名字，不发说明书，用的时候才临时查。" },
  { start: 0.70, end: 0.85, text: "就像瑞士军刀，有些刀片你知道有但没打开过，需要的时候再拽出来。" },
  { start: 0.85, end: 1.00, text: "接上五六个 MCP，工具数量能到一百多个。" },
];

const TOOLS = ["Bash", "Read", "Edit", "Grep", "Agent", "Skill"];
const MCP_CHIPS = ["github", "slack", "gmail", "postgres", "jira"];

// JSON schema code lines: [text, colorFn]
// colorFn: key|str|num|brace|comment|plain
const CODE_LINES = [
  { t: "{", c: "brace" },
  { t: '  "name": "Bash",', c: "keystr" },
  { t: '  "description": "Execute shell commands",', c: "keystr" },
  { t: '  "input_schema": {', c: "keybrace" },
  { t: '    "type": "object",', c: "keystr" },
  { t: '    "properties": {', c: "keybrace" },
  { t: '      "command": {', c: "keybrace" },
  { t: '        "type": "string",', c: "keystr" },
  { t: '        "description": "Shell command to run"', c: "keystr" },
  { t: "      },", c: "brace" },
  { t: '      "timeout": {', c: "keybrace" },
  { t: '        "type": "number",', c: "keynum" },
  { t: '        "default": 120000', c: "keynum" },
  { t: "      }", c: "brace" },
  { t: "    }", c: "brace" },
  { t: "  }", c: "brace" },
  { t: "}", c: "brace" },
];

function buildCodeLine(lineData) {
  const row = mk("div", `display:flex;align-items:baseline;gap:0;line-height:1.65;`);
  const text = lineData.t;
  const colorType = lineData.c;

  if (colorType === "brace") {
    row.appendChild(mk("span", `font-family:${C.mono};font-size:15px;color:${C.codeBrace};white-space:pre;`, text));
  } else if (colorType === "keystr") {
    // split: "key": "value"  or  "key": "value",
    const m = text.match(/^(\s*)("[\w_]+")(:\s*)(".*?")(,?)$/);
    if (m) {
      const spans = [
        [m[1], C.codeBrace],
        [m[2], C.codeKey],
        [m[3], C.codeBrace],
        [m[4], C.codeStr],
        [m[5], C.codeBrace],
      ];
      for (const [t2, col] of spans) {
        if (t2) row.appendChild(mk("span", `font-family:${C.mono};font-size:15px;color:${col};white-space:pre;`, t2));
      }
    } else {
      row.appendChild(mk("span", `font-family:${C.mono};font-size:15px;color:${C.ink};white-space:pre;`, text));
    }
  } else if (colorType === "keynum") {
    // "key": number
    const m = text.match(/^(\s*)("[\w_]+")(:\s*)(\d+)(,?)$/);
    if (m) {
      const spans = [
        [m[1], C.codeBrace],
        [m[2], C.codeKey],
        [m[3], C.codeBrace],
        [m[4], C.codeNum],
        [m[5], C.codeBrace],
      ];
      for (const [t2, col] of spans) {
        if (t2) row.appendChild(mk("span", `font-family:${C.mono};font-size:15px;color:${col};white-space:pre;`, t2));
      }
    } else {
      row.appendChild(mk("span", `font-family:${C.mono};font-size:15px;color:${C.ink};white-space:pre;`, text));
    }
  } else if (colorType === "keybrace") {
    // "key": {  or  "key": {,
    const m = text.match(/^(\s*)("[\w_]+")(:\s*)(\{)(,?)$/);
    if (m) {
      const spans = [
        [m[1], C.codeBrace],
        [m[2], C.codeKey],
        [m[3], C.codeBrace],
        [m[4] + m[5], C.codeBrace],
      ];
      for (const [t2, col] of spans) {
        if (t2) row.appendChild(mk("span", `font-family:${C.mono};font-size:15px;color:${col};white-space:pre;`, t2));
      }
    } else {
      row.appendChild(mk("span", `font-family:${C.mono};font-size:15px;color:${C.ink};white-space:pre;`, text));
    }
  } else {
    row.appendChild(mk("span", `font-family:${C.mono};font-size:15px;color:${C.ink};white-space:pre;`, text));
  }
  return row;
}

export default {
  id: "dimToolsSlide",
  type: "dom",
  name: "Dim Tools Slide",
  category: "Layout",
  defaultParams: {},

  create(container) {
    const root = createRoot(container, `background:${C.bg};display:flex;flex-direction:column;font-family:${C.sans};`);

    // ── A-zone: top bar (80px) ──────────────────────────────────────────
    const topBar = mk("div", [
      "display:flex", "align-items:center", "justify-content:space-between",
      "padding:0 60px", "height:80px", "flex-shrink:0",
      `border-bottom:1px solid ${C.ink15}`,
    ].join(";"));

    const brandLeft = mk("div", `display:flex;flex-direction:column;gap:2px;`);
    const brandName = mk("span", `font-family:${C.sans};font-size:13px;font-weight:600;color:${C.ac};letter-spacing:0.06em;`, "OPC · 王宇轩");
    const seriesTitle = mk("span", `font-family:${C.sans};font-size:24px;font-weight:700;color:${C.ink};letter-spacing:0.01em;`, "《深入浅出 Claude Code 源代码》");
    ap(brandLeft, brandName, seriesTitle);

    const epWatermark = mk("span", [
      `font-family:${C.sans}`, "font-size:180px", "font-weight:800",
      `color:${C.ink}`, "opacity:0.04", "letter-spacing:0.04em",
      "user-select:none", "line-height:1", "position:absolute", "right:40px", "top:-60px",
    ].join(";"), "E01");

    topBar.style.position = "relative";
    ap(topBar, brandLeft, epWatermark);

    // ── B-zone: content area ──────────────────────────────────────────────
    const contentWrap = mk("div", "flex:1;min-height:0;position:relative;overflow:hidden;padding:0 60px;");

    // Phase 1 container
    const phase1 = mk("div", `position:absolute;inset:0;padding:24px 60px 0;display:flex;flex-direction:column;gap:24px;`);

    // Title row
    const titleRow = mk("div", `display:flex;align-items:center;gap:20px;`);
    const toolsBadge = mk("div", [
      `font-family:${C.mono}`, "font-size:16px", "font-weight:700",
      `color:${C.ac}`, `background:${C.ac10}`, `border:1px solid ${C.ac25}`,
      "border-radius:20px", "padding:6px 18px", "letter-spacing:0.04em", "white-space:nowrap",
    ].join(";"), "tools[]");
    const mainTitle = mk("h1", [
      `font-family:${C.serif}`, "font-size:52px", "font-weight:700",
      `color:${C.ink}`, "margin:0", "letter-spacing:0.01em",
    ].join(";"), "工具箱");
    const countBadge = mk("span", [
      `font-family:${C.sans}`, "font-size:14px", "font-weight:500",
      `color:${C.ink50}`, "letter-spacing:0.06em",
    ].join(";"), "20+ built-in");
    ap(titleRow, toolsBadge, mainTitle, countBadge);

    // Code window
    const codeWin = mk("div", [
      `background:#111111`, "border-radius:12px",
      `border:1px solid rgba(255,255,255,.10)`,
      "overflow:hidden", "flex:1", "min-height:0",
      "box-shadow:0 12px 48px rgba(0,0,0,.5)",
    ].join(";"));

    const titleBarEl = mk("div", [
      "display:flex", "align-items:center", "gap:8px",
      "padding:12px 16px", "background:#1e1e1e",
      `border-bottom:1px solid rgba(255,255,255,.08)`,
    ].join(";"));
    const dotR = mk("div", `width:12px;height:12px;border-radius:50%;background:#ff5f57;`);
    const dotY = mk("div", `width:12px;height:12px;border-radius:50%;background:#ffbd2e;`);
    const dotG = mk("div", `width:12px;height:12px;border-radius:50%;background:#28c841;`);
    const titleBarLabel = mk("span", `font-family:${C.mono};font-size:12px;color:rgba(255,255,255,.4);margin-left:auto;margin-right:auto;`, "tool.json");
    ap(titleBarEl, dotR, dotY, dotG, titleBarLabel);

    const codeBody = mk("div", `padding:20px 24px;overflow:hidden;`);
    const codeLineEls = CODE_LINES.map((lineData) => {
      const row = buildCodeLine(lineData);
      row.style.opacity = "0";
      row.style.transform = "translateX(-8px)";
      row.style.transition = "none";
      codeBody.appendChild(row);
      return row;
    });

    ap(codeWin, titleBarEl, codeBody);

    // Tool chips row
    const toolChipsRow = mk("div", `display:flex;gap:12px;flex-wrap:wrap;padding-bottom:12px;`);
    const toolChipEls = TOOLS.map((name) => {
      const chip = mk("div", [
        `font-family:${C.mono}`, "font-size:15px", "font-weight:600",
        `color:${C.ink}`, `background:${C.bg2}`,
        `border:1px solid ${C.ink15}`, "border-radius:8px",
        "padding:6px 16px", "opacity:0", "transform:translateY(8px)",
        "transition:none",
      ].join(";"), name);
      toolChipsRow.appendChild(chip);
      return chip;
    });

    ap(phase1, titleRow, codeWin, toolChipsRow);

    // Phase 2 container
    const phase2 = mk("div", `position:absolute;inset:0;padding:32px 60px 0;display:flex;flex-direction:column;gap:28px;opacity:0;`);

    // Cards row
    const cardsRow = mk("div", `display:flex;gap:28px;flex:1;min-height:0;`);

    // MCP card
    const mcpCard = mk("div", [
      `background:${C.bg2}`,
      `border:1px solid ${C.green20}`,
      "border-radius:16px", "flex:1", "padding:28px",
      "display:flex", "flex-direction:column", "gap:20px",
      "overflow:hidden", "transform:translateX(-40px)", "opacity:0",
    ].join(";"));
    const mcpTop = mk("div", `height:4px;background:${C.green};border-radius:2px;margin:-28px -28px 0;`);
    const mcpTitle = mk("h2", [
      `font-family:${C.sans}`, "font-size:22px", "font-weight:700",
      `color:${C.ink}`, "margin:8px 0 0",
    ].join(";"), "MCP 服务器工具");
    const mcpDesc = mk("p", [
      `font-family:${C.sans}`, "font-size:15px", `color:${C.ink50}`,
      "margin:0", "line-height:1.6",
    ].join(";"), "接入 MCP 服务器后，服务器提供的工具自动注入到 tools[] 中，AI 可直接调用。");
    const mcpChipsWrap = mk("div", `display:flex;gap:10px;flex-wrap:wrap;`);
    const mcpChipEls = MCP_CHIPS.map((name) => {
      const chip = mk("div", [
        `font-family:${C.mono}`, "font-size:13px", "font-weight:600",
        `color:${C.green}`, `background:${C.green20}`,
        `border:1px solid rgba(126,198,153,.35)`, "border-radius:6px",
        "padding:4px 12px", "opacity:0", "transform:scale(0.85)",
        "transition:none",
      ].join(";"), name);
      mcpChipsWrap.appendChild(chip);
      return chip;
    });
    ap(mcpCard, mcpTop, mcpTitle, mcpDesc, mcpChipsWrap);

    // Deferred card
    const defCard = mk("div", [
      `background:${C.bg2}`,
      `border:1.5px dashed rgba(212,180,131,.35)`,
      "border-radius:16px", "flex:1", "padding:28px",
      "display:flex", "flex-direction:column", "gap:20px",
      "overflow:hidden", "transform:translateX(40px)", "opacity:0",
    ].join(";"));
    const defTop = mk("div", `height:4px;background:${C.gold};border-radius:2px;margin:-28px -28px 0;`);
    const defTitle = mk("h2", [
      `font-family:${C.sans}`, "font-size:22px", "font-weight:700",
      `color:${C.ink}`, "margin:8px 0 0",
    ].join(";"), "按需加载工具");
    const defDesc = mk("p", [
      `font-family:${C.sans}`, "font-size:15px", `color:${C.ink50}`,
      "margin:0", "line-height:1.6",
    ].join(";"), "Deferred 工具只在 tools[] 里留名字，不发 Schema。需要时临时拉取完整说明书，节省上下文 Token。");
    const defBox = mk("div", [
      `background:rgba(212,180,131,.08)`, "border-radius:10px", "padding:16px 20px",
    ].join(";"));
    const defCode = mk("code", `font-family:${C.mono};font-size:13px;color:${C.gold};line-height:1.8;display:block;white-space:pre;`,
      '{ "name": "WebSearch" }\n// Schema omitted — fetch on demand');
    ap(defBox, defCode);
    ap(defCard, defTop, defTitle, defDesc, defBox);

    ap(cardsRow, mcpCard, defCard);

    // Big number row
    const bigNumWrap = mk("div", `display:flex;align-items:center;gap:20px;padding-bottom:16px;`);
    const bigNum = mk("div", [
      `font-family:${C.serif}`, "font-size:72px", "font-weight:700",
      `color:${C.ac}`, "line-height:1", "opacity:0", "transform:scale(0.6)",
    ].join(";"), "100+");
    const bigNumLabel = mk("div", [
      `font-family:${C.sans}`, "font-size:18px", `color:${C.ink50}`,
      "line-height:1.5", "opacity:0",
    ].join(";"), "个工具\n接上五六个 MCP 轻松达到");
    bigNumLabel.style.whiteSpace = "pre";
    ap(bigNumWrap, bigNum, bigNumLabel);

    ap(phase2, cardsRow, bigNumWrap);
    ap(contentWrap, phase1, phase2);

    // ── D-zone: bottom bar (80px) ──────────────────────────────────────────
    const bottomBar = mk("div", [
      "flex-shrink:0", "display:flex", "flex-direction:column",
      `border-top:1px solid ${C.ink15}`,
    ].join(";"));

    const progressTrack = mk("div", `width:100%;height:8px;background:${C.ac10};position:relative;overflow:hidden;`);
    const progressFill = mk("div", `height:100%;width:40%;background:${C.ac};`);
    progressTrack.appendChild(progressFill);

    const subtitleArea = mk("div", [
      "height:72px", "display:flex", "align-items:center", "justify-content:center",
      `font-family:${C.sans}`, "font-size:22px", `color:${C.ink75}`,
      "letter-spacing:0.02em", "text-align:center", "padding:0 120px",
    ].join(";"));

    ap(bottomBar, progressTrack, subtitleArea);
    ap(root, topBar, contentWrap, bottomBar);

    return {
      root,
      // Phase 1
      phase1, titleRow, toolsBadge, mainTitle,
      codeWin, codeLineEls, toolChipEls,
      // Phase 2
      phase2, mcpCard, defCard, mcpChipEls, bigNum, bigNumLabel,
      // UI
      subtitleArea,
      // animation state
      _lastSub: "",
    };
  },

  update(els, localT) {
    const t = localT;

    // ── Subtitle ──────────────────────────────────────────────────────
    let subText = "";
    for (const s of SUBS) {
      if (t >= s.start && t <= s.end) { subText = s.text; break; }
    }
    if (subText !== els._lastSub) {
      els.subtitleArea.textContent = subText;
      els._lastSub = subText;
    }

    // ── Phase 1 ───────────────────────────────────────────────────────
    const p1enter = smoothstep(0, 0.05, t);
    // Phase 1 fades out 0.35→0.40
    const p1exit = 1 - smoothstep(0.35, 0.40, t);
    els.phase1.style.opacity = p1enter * p1exit;

    // Title row slides in 0.02→0.05
    const titleSlide = smoothstep(0.02, 0.05, t);
    const titleY = (1 - easeOutCubic(titleSlide)) * 20;
    els.titleRow.style.transform = `translateY(${titleY}px)`;
    els.titleRow.style.opacity = titleSlide;

    // Code window fades in 0.05→0.15
    const codeEnter = smoothstep(0.05, 0.15, t);
    els.codeWin.style.opacity = codeEnter;

    // Code lines appear sequentially 0.10→0.30
    const lineCount = els.codeLineEls.length;
    for (let i = 0; i < lineCount; i++) {
      const lineStart = 0.10 + (i / lineCount) * 0.20;
      const lineAlpha = smoothstep(lineStart, lineStart + 0.04, t);
      const lineX = (1 - easeOutCubic(lineAlpha)) * (-8);
      const el = els.codeLineEls[i];
      el.style.opacity = lineAlpha;
      el.style.transform = `translateX(${lineX}px)`;
    }

    // Tool chips appear 0.20→0.35
    const chipCount = els.toolChipEls.length;
    for (let i = 0; i < chipCount; i++) {
      const chipStart = 0.20 + (i / chipCount) * 0.15;
      const chipAlpha = smoothstep(chipStart, chipStart + 0.03, t);
      const chipY = (1 - easeOutCubic(chipAlpha)) * 8;
      const el = els.toolChipEls[i];
      el.style.opacity = chipAlpha;
      el.style.transform = `translateY(${chipY}px)`;
    }

    // ── Phase 2 ───────────────────────────────────────────────────────
    const p2enter = smoothstep(0.35, 0.42, t);
    const p2exit = 1 - smoothstep(0.95, 1.00, t);
    els.phase2.style.opacity = p2enter * p2exit;

    // MCP card slides in from left 0.40→0.50
    const mcpSlide = easeOutCubic(smoothstep(0.40, 0.50, t));
    const mcpX = (1 - mcpSlide) * (-40);
    els.mcpCard.style.transform = `translateX(${mcpX}px)`;
    els.mcpCard.style.opacity = mcpSlide;

    // MCP chips appear sequentially 0.46→0.55
    const mChipCount = els.mcpChipEls.length;
    for (let i = 0; i < mChipCount; i++) {
      const cs = 0.46 + (i / mChipCount) * 0.09;
      const ca = smoothstep(cs, cs + 0.03, t);
      const cs2 = 0.85 + (1 - ca) * 0.15;
      const el = els.mcpChipEls[i];
      el.style.opacity = ca;
      el.style.transform = `scale(${cs2})`;
    }

    // Deferred card slides in from right 0.50→0.65
    const defSlide = easeOutCubic(smoothstep(0.50, 0.65, t));
    const defX = (1 - defSlide) * 40;
    els.defCard.style.transform = `translateX(${defX}px)`;
    els.defCard.style.opacity = defSlide;

    // Big number bounces in 0.80→0.85
    const numBounce = easeOutBack(smoothstep(0.80, 0.85, t));
    const numScale = 0.6 + numBounce * 0.4;
    els.bigNum.style.transform = `scale(${numScale})`;
    els.bigNum.style.opacity = smoothstep(0.80, 0.83, t);
    els.bigNumLabel.style.opacity = smoothstep(0.82, 0.87, t);

    // ── Global fade out 0.95→1.00 ────────────────────────────────────
    const globalAlpha = 1 - smoothstep(0.95, 1.00, t);
    els.root.style.opacity = (smoothstep(0, 0.02, t)) * globalAlpha;
  },

  destroy(els) { els.root.remove(); },
};
