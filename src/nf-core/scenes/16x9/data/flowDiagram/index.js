export const meta = {
  id: "flowDiagram", version: 1, ratio: "16:9", category: "data",
  label: "Flow Diagram",
  description: "横向流程图：节点 + 箭头 + 标签。节点按时间顺序淡入，适合讲解流程/管线。",
  tech: "dom", duration_hint: 10, loopable: false, z_hint: "middle",
  tags: ["流程图", "flow", "diagram", "节点", "箭头"],
  mood: ["analytical", "focused"], theme: ["education", "tech", "presentation"],
  default_theme: "anthropic-warm",
  themes: {
    "anthropic-warm": { nodeBg: "#2a1f18", nodeBorder: "#da7756", nodeText: "#f5ece0", arrowColor: "#d4b483", passColor: "#7ec699", blockColor: "#e06c75" },
    "cool-blue":      { nodeBg: "#121820", nodeBorder: "#8ab4cc", nodeText: "#e8f0f5", arrowColor: "#8ab4cc", passColor: "#7ec699", blockColor: "#e06c75" },
  },
  params: {
    nodes:       { type: "array",  required: true, default: [], label: "节点列表", semantic: "array of {id, label, type} objects. type: 'main'|'pass'|'block'|'decision'", group: "content" },
    title:       { type: "string", default: "", label: "标题", group: "content" },
    enterDur:    { type: "number", default: 0.4, label: "每节点淡入时长(s)", group: "animation", range: [0.1, 2], step: 0.1 },
    enterStagger:{ type: "number", default: 0.5, label: "节点间隔(s)", group: "animation", range: [0.1, 3], step: 0.1 },
    nodeBg:      { type: "color",  default: "#2a1f18", label: "节点背景", group: "color" },
    nodeBorder:  { type: "color",  default: "#da7756", label: "节点边框", group: "color" },
    nodeText:    { type: "color",  default: "#f5ece0", label: "节点文字", group: "color" },
    arrowColor:  { type: "color",  default: "#d4b483", label: "箭头颜色", group: "color" },
    passColor:   { type: "color",  default: "#7ec699", label: "PASS 节点颜色", group: "color" },
    blockColor:  { type: "color",  default: "#e06c75", label: "BLOCK 节点颜色", group: "color" },
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

function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

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
    const op = ease3((t - appearAt) / p.enterDur);
    nodeIdx++;

    // Arrow after this node (except last)
    if (i < mainNodes.length - 1) {
      const arrowOp = ease3((t - (nodeIdx - 0.5) * p.enterStagger) / p.enterDur);
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
      const op = ease3((t - appearAt) / p.enterDur);
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

  // Render
  let html = '<div style="position:absolute;inset:0;overflow:hidden">';

  // Title
  if (p.title) {
    const titleOp = ease3(t / p.enterDur);
    html += '<div style="position:absolute;top:60px;left:0;right:0;text-align:center;font:600 36px Georgia,serif;color:' + p.nodeText + ';opacity:' + titleOp + '">' + p.title + '</div>';
  }

  for (const shape of shapes) {
    const opClamped = Math.max(0, Math.min(1, shape.op));
    if (opClamped <= 0) continue;

    if (shape.kind === "arrow") {
      html += '<div style="position:absolute;left:' + shape.x + 'px;top:' + (shape.y - 1) + 'px;width:' + shape.w + 'px;height:2px;' +
        'background:' + shape.color + ';opacity:' + opClamped + '">' +
        '<div style="position:absolute;right:0;top:50%;transform:translateY(-50%);width:0;height:0;' +
        'border-top:7px solid transparent;border-bottom:7px solid transparent;border-left:12px solid ' + shape.color + '"></div>' +
        '</div>';
    } else if (shape.kind === "varrow") {
      const lineH = shape.y2 - shape.y1;
      html += '<div style="position:absolute;left:' + (shape.x - 1) + 'px;top:' + shape.y1 + 'px;width:2px;height:' + lineH + 'px;' +
        'background:' + shape.color + ';opacity:' + opClamped + '">' +
        '<div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:0;height:0;' +
        'border-left:7px solid transparent;border-right:7px solid transparent;border-top:12px solid ' + shape.color + '"></div>' +
        '</div>';
    } else if (shape.kind === "node") {
      const n = shape.node;
      let bgColor = p.nodeBg;
      let borderColor = p.nodeBorder;
      let textColor = p.nodeText;
      if (n.type === "pass")  { bgColor = "rgba(126,198,153,0.15)"; borderColor = p.passColor; textColor = p.passColor; }
      if (n.type === "block") { bgColor = "rgba(224,108,117,0.15)"; borderColor = p.blockColor; textColor = p.blockColor; }

      const isDecision = n.type === "decision";
      let nodeStyle;
      if (isDecision) {
        // Diamond shape using clip-path
        nodeStyle = 'position:absolute;left:' + shape.x + 'px;top:' + shape.y + 'px;width:' + shape.w + 'px;height:' + shape.h + 'px;' +
          'display:flex;align-items:center;justify-content:center;' +
          'clip-path:polygon(50% 0%,100% 50%,50% 100%,0% 50%);' +
          'background:' + bgColor + ';outline:2px solid ' + borderColor + ';' +
          'opacity:' + opClamped;
      } else {
        nodeStyle = 'position:absolute;left:' + shape.x + 'px;top:' + shape.y + 'px;width:' + shape.w + 'px;height:' + shape.h + 'px;' +
          'display:flex;align-items:center;justify-content:center;' +
          'border:2px solid ' + borderColor + ';border-radius:8px;' +
          'background:' + bgColor + ';' +
          'opacity:' + opClamped;
      }
      html += '<div style="' + nodeStyle + '">' +
        '<div style="font:600 28px system-ui,sans-serif;color:' + textColor + ';text-align:center;padding:0 12px">' + (n.label || n.id) + '</div>' +
        '</div>';
    }
  }

  html += '</div>';
  return html;
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
