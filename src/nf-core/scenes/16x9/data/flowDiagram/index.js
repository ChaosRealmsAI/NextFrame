import { TOKENS, esc, escAttr, easeOutCubic, fadeIn, sw16, sh16 } from "../../../shared/design.js";

export const meta = {
  id: "flowDiagram", version: 1, ratio: "16:9", category: "data",
  label: "Flow Diagram",
  description: "横向流程图：节点 + 箭头 + 标签。节点按时间顺序淡入，适合讲解流程/管线。",
  tech: "dom", duration_hint: 10, loopable: false, z_hint: "middle",
  tags: ["流程图", "flow", "diagram", "节点", "箭头"],
  mood: ["analytical", "focused"], theme: ["education", "tech", "presentation"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": { nodeBg: "#2a1f18", nodeBorder: TOKENS.lecture.accent, nodeText: TOKENS.lecture.text, arrowColor: TOKENS.lecture.gold, passColor: TOKENS.lecture.green, blockColor: TOKENS.lecture.red },
    "cool-blue":      { nodeBg: "#121820", nodeBorder: "#8ab4cc", nodeText: "#e8f0f5", arrowColor: "#8ab4cc", passColor: TOKENS.lecture.green, blockColor: TOKENS.lecture.red },
  },
  params: {
    nodes:       { type: "array",  required: true, default: [], label: "节点列表", semantic: "array of {id, label, type} objects. type: 'main'|'pass'|'block'|'decision'", group: "content" },
    title:       { type: "string", default: "", label: "标题", group: "content" },
    enterDur:    { type: "number", default: 0.4, label: "每节点淡入时长(s)", group: "animation", range: [0.1, 2], step: 0.1 },
    enterStagger:{ type: "number", default: 0.5, label: "节点间隔(s)", group: "animation", range: [0.1, 3], step: 0.1 },
    nodeBg:      { type: "color",  default: "#2a1f18", label: "节点背景", group: "color" },
    nodeBorder:  { type: "color",  default: TOKENS.lecture.accent, label: "节点边框", group: "color" },
    nodeText:    { type: "color",  default: TOKENS.lecture.text, label: "节点文字", group: "color" },
    arrowColor:  { type: "color",  default: TOKENS.lecture.gold, label: "箭头颜色", group: "color" },
    passColor:   { type: "color",  default: TOKENS.lecture.green, label: "PASS 节点颜色", group: "color" },
    blockColor:  { type: "color",  default: TOKENS.lecture.red, label: "BLOCK 节点颜色", group: "color" },
    y:           { type: "number", default: 0, label: "Y 偏移(px, 0=居中)", group: "style", range: [0, 1080], step: 10 },
    nodeWidth:   { type: "number", default: 220, label: "节点宽(px)", group: "style", range: [120, 400], step: 10 },
    nodeHeight:  { type: "number", default: 90, label: "节点高(px)", group: "style", range: [50, 200], step: 10 },
  },
  ai: {
    when: "展示流程、管线、决策链等横向图。节点按时间逐步出现，适合讲解动画。",
    how: "nodes 数组定义节点，type=decision 用菱形，type=pass 用绿色，type=block 用红色。enterStagger 控制节点出现间隔。",
    example: {
      nodes: [
        { id: "ai",   label: "AI 请求", type: "main" },
        { id: "hook", label: "Hook 检查", type: "decision" },
        { id: "pass", label: "PASS ✓", type: "pass" },
        { id: "block", label: "BLOCK ✗", type: "block" },
      ],
      enterStagger: 0.8,
    },
    avoid: "节点数量超过 5 个会显得拥挤，建议拆成多张图。",
    pairs_with: ["headlineCenter", "subtitleBar", "progressBar16x9"],
  },
};

export function render(t, params, vp) {
  const p = {};
  for (const k in meta.params) p[k] = params[k] !== undefined ? params[k] : meta.params[k].default;

  const nodes = Array.isArray(p.nodes) ? p.nodes : [];
  if (nodes.length === 0) {
    return '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(245,236,224,.3);font:400 24px system-ui">No nodes</div>';
  }

  const nw = p.nodeWidth;
  const nh = p.nodeHeight;
  const arrowW = 60;
  const gapBetween = nw + arrowW;

  // For decision node, we split: main row → [ai, hook], then branch row below for pass/block
  // Determine layout: main flow nodes are all non-branch, branch nodes are pass/block
  const mainNodes = nodes.filter((n) => n.type !== "pass" && n.type !== "block");
  const branchNodes = nodes.filter((n) => n.type === "pass" || n.type === "block");

  // Total layout: main flow horizontal, then branches coming off last decision node vertically
  const decisionIdx = mainNodes.findIndex((n) => n.type === "decision");

  // Compute total width for main flow
  const mainFlowCount = mainNodes.length;
  const totalMainW = mainFlowCount * nw + (mainFlowCount - 1) * arrowW;

  // Branch nodes shown below/above decision node
  const branchCount = branchNodes.length;
  const totalBranchW = branchCount > 1 ? branchCount * nw + (branchCount - 1) * 40 : nw;

  const totalW = Math.max(totalMainW, totalBranchW);

  const startX = (vp.width - totalMainW) / 2;
  const mainY = p.y > 0 ? p.y : (branchCount > 0 ? vp.height * 0.35 : vp.height / 2 - nh / 2);
  const branchY = mainY + nh + 70;

  // Build shapes array
  const shapes = [];
  let nodeIdx = 0;

  // Main flow nodes
  for (let i = 0; i < mainNodes.length; i++) {
    const n = mainNodes[i];
    const nx = startX + i * (nw + arrowW);
    const ny = mainY;
    const appearAt = nodeIdx * p.enterStagger;
    const op = easeOutCubic((t - appearAt) / p.enterDur);
    nodeIdx++;

    // Arrow after this node (except last)
    if (i < mainNodes.length - 1) {
      const arrowOp = easeOutCubic((t - (nodeIdx - 0.5) * p.enterStagger) / p.enterDur);
      shapes.push({ kind: "arrow", x: nx + nw, y: ny + nh / 2, w: arrowW, op: arrowOp, color: p.arrowColor, dir: "right" });
    }
    shapes.push({ kind: "node", x: nx, y: ny, w: nw, h: nh, op, node: n });
  }

  // Branch nodes from decision node
  if (branchCount > 0 && decisionIdx >= 0) {
    const decisionX = startX + decisionIdx * (nw + arrowW);
    const decisionCX = decisionX + nw / 2;

    // Calculate branch positions
    const branchStartX = decisionCX - totalBranchW / 2;

    for (let i = 0; i < branchNodes.length; i++) {
      const n = branchNodes[i];
      const bx = branchStartX + i * (nw + 40);
      const by = branchY;
      const appearAt = nodeIdx * p.enterStagger;
      const op = easeOutCubic((t - appearAt) / p.enterDur);
      nodeIdx++;

      // Vertical arrow from decision to branch
      const arrowStartX = bx + nw / 2;
      const arrowFromY = mainY + nh;
      const arrowToY = by;
      const arrowOp = op;
      shapes.push({ kind: "varrow", x: arrowStartX, y1: arrowFromY, y2: arrowToY, op: arrowOp, color: p.arrowColor });
      shapes.push({ kind: "node", x: bx, y: by, w: nw, h: nh, op, node: n });
    }
  }

  // Render as single SVG for reliable WKWebView capture
  const svgW = vp.width;
  const svgH = vp.height;
  let svg = '<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0" width="' + svgW + '" height="' + svgH + '" viewBox="0 0 ' + svgW + ' ' + svgH + '">';

  // Title
  if (p.title) {
    const titleOp = Math.max(0, Math.min(1, easeOutCubic(t / p.enterDur)));
    svg += '<text x="' + svgW / 2 + '" y="80" text-anchor="middle" font-family="Georgia,serif" font-size="36" font-weight="600" fill="' + p.nodeText + '" opacity="' + titleOp + '">' + esc(p.title) + '</text>';
  }

  for (const shape of shapes) {
    const opClamped = Math.max(0, Math.min(1, shape.op));
    if (opClamped <= 0) continue;

    if (shape.kind === "arrow") {
      const y = shape.y;
      svg += '<g opacity="' + opClamped + '">' +
        '<line x1="' + shape.x + '" y1="' + y + '" x2="' + (shape.x + shape.w - 12) + '" y2="' + y + '" stroke="' + shape.color + '" stroke-width="2"/>' +
        '<polygon points="' + (shape.x + shape.w) + ',' + y + ' ' + (shape.x + shape.w - 12) + ',' + (y - 7) + ' ' + (shape.x + shape.w - 12) + ',' + (y + 7) + '" fill="' + shape.color + '"/>' +
        '</g>';
    } else if (shape.kind === "varrow") {
      const lineH = shape.y2 - shape.y1;
      svg += '<g opacity="' + opClamped + '">' +
        '<line x1="' + shape.x + '" y1="' + shape.y1 + '" x2="' + shape.x + '" y2="' + (shape.y2 - 12) + '" stroke="' + shape.color + '" stroke-width="2"/>' +
        '<polygon points="' + shape.x + ',' + shape.y2 + ' ' + (shape.x - 7) + ',' + (shape.y2 - 12) + ' ' + (shape.x + 7) + ',' + (shape.y2 - 12) + '" fill="' + shape.color + '"/>' +
        '</g>';
    } else if (shape.kind === "node") {
      const n = shape.node;
      let bgColor = p.nodeBg;
      let borderColor = p.nodeBorder;
      let textColor = p.nodeText;
      if (n.type === "pass")  { bgColor = "rgba(126,198,153,0.15)"; borderColor = p.passColor; textColor = p.passColor; }
      if (n.type === "block") { bgColor = "rgba(224,108,117,0.15)"; borderColor = p.blockColor; textColor = p.blockColor; }
      const cx = shape.x + shape.w / 2;
      const cy = shape.y + shape.h / 2;

      if (n.type === "decision") {
        svg += '<g opacity="' + opClamped + '">' +
          '<polygon points="' + cx + ',' + shape.y + ' ' + (shape.x + shape.w) + ',' + cy + ' ' + cx + ',' + (shape.y + shape.h) + ' ' + shape.x + ',' + cy + '" fill="' + bgColor + '" stroke="' + borderColor + '" stroke-width="2"/>' +
          '<text x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="600" fill="' + textColor + '">' + esc(n.label || n.id) + '</text>' +
          '</g>';
      } else {
        svg += '<g opacity="' + opClamped + '">' +
          '<rect x="' + shape.x + '" y="' + shape.y + '" width="' + shape.w + '" height="' + shape.h + '" rx="8" fill="' + bgColor + '" stroke="' + borderColor + '" stroke-width="2"/>' +
          '<text x="' + cx + '" y="' + (cy + 10) + '" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" font-weight="600" fill="' + textColor + '">' + esc(n.label || n.id) + '</text>' +
          '</g>';
      }
    }
  }

  svg += '</svg>';
  return svg;
}

export function screenshots() {
  return [
    { t: 0, label: "初始（空）" },
    { t: 1.5, label: "前两个节点" },
    { t: 3, label: "全部节点" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (!Array.isArray(params.nodes)) errors.push("nodes 必须是数组。Fix: 传入节点数组");
  if (Array.isArray(params.nodes) && params.nodes.length === 0) errors.push("nodes 为空，图不会显示。Fix: 至少传入一个节点");
  return { ok: errors.length === 0, errors };
}
