import { getPreset, scaleW, scaleH } from "../../../shared/design.js";

export const meta = {
  id: "flowDiagram",
  version: 1,
  ratio: "16:9",
  category: "data",
  label: "Flow Diagram",
  description: "流程图（单 SVG 元素），WKWebView 兼容，节点逐个淡入，支持分支节点",
  tech: "dom",
  duration_hint: 8,
  loopable: false,
  z_hint: "middle",
  tags: ["data", "flow", "diagram"],
  mood: ["professional"],
  theme: ["tech"],
  default_theme: "lecture-warm",
  themes: { "lecture-warm": {} },
  params: {
    nodes: {
      type: "array",
      default: [
        { id: "a", label: "AI Request", type: "start" },
        { id: "b", label: "Hook Check", type: "decision" },
        { id: "c", label: "PASS ✓", type: "success" },
        { id: "d", label: "Execute", type: "end" },
        { id: "e", label: "BLOCK ✗", type: "error" },
      ],
      label: "节点列表",
      group: "content",
    },
    edges: {
      type: "array",
      default: [
        { from: "a", to: "b" },
        { from: "b", to: "c", label: "pass" },
        { from: "c", to: "d" },
        { from: "b", to: "e", label: "block", branch: true },
      ],
      label: "连线",
      group: "content",
    },
  },
  ai: {
    when: "Phase 3 流程图段，可视化展示处理流程、分支逻辑",
    how: "Add as layer with nodes/edges params. Nodes appear one by one with stagger.",
    example: {
      nodes: [
        { id: "a", label: "AI Request", type: "start" },
        { id: "b", label: "Hook Check", type: "decision" },
        { id: "c", label: "PASS ✓", type: "success" },
        { id: "d", label: "Execute", type: "end" },
        { id: "e", label: "BLOCK ✗", type: "error" },
      ],
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c", label: "pass" },
        { from: "c", to: "d" },
        { from: "b", to: "e", label: "block", branch: true },
      ],
    },
    avoid: "不要用多个 positioned div 画流程图，只用单个 SVG（WKWebView 兼容要求）",
    pairs_with: ["lectureChrome", "subtitleBar"],
  },
};

function ease3(p) { return 1 - Math.pow(1 - Math.max(0, Math.min(1, p)), 3); }

export function render(t, params, vp) {
  const preset = getPreset("lecture-warm");
  const { colors } = preset;

  const W = vp.width;
  const H = vp.height;

  // Layout: main flow is horizontal (left to right), branch goes down from decision node
  // Node layout (in SVG coordinate space based on 1920x1080)
  const svgW = 1920;
  const svgH = 1080;

  // Scale factor to fill canvas
  const sx = W / svgW;
  const sy = H / svgH;

  // Fixed node positions for our specific diagram
  const nodePos = {
    a: { x: 310, y: 420 },
    b: { x: 680, y: 420 },
    c: { x: 1050, y: 420 },
    d: { x: 1420, y: 420 },
    e: { x: 680, y: 700 },
  };

  const nodeW = 220;
  const nodeH = 72;
  const rx = 12;

  const nodeTypeStyle = {
    start:    { fill: "rgba(126,200,227,0.15)", stroke: "#7ec8e3", textColor: "#7ec8e3" },
    decision: { fill: "rgba(212,180,131,0.15)", stroke: colors.primary, textColor: colors.primary },
    success:  { fill: "rgba(126,198,153,0.15)", stroke: "#7ec699", textColor: "#7ec699" },
    end:      { fill: "rgba(126,200,227,0.15)", stroke: "#7ec8e3", textColor: "#7ec8e3" },
    error:    { fill: "rgba(224,108,117,0.15)", stroke: "#e06c75", textColor: "#e06c75" },
  };

  const fontSize = 28;
  const labelFontSize = 20;

  // Stagger: each node appears at 0.4s intervals
  const nodes = (params.nodes || [
    { id: "a", label: "AI Request", type: "start" },
    { id: "b", label: "Hook Check", type: "decision" },
    { id: "c", label: "PASS \u2713", type: "success" },
    { id: "d", label: "Execute", type: "end" },
    { id: "e", label: "BLOCK \u2717", type: "error" },
  ]);

  const edges = (params.edges || [
    { from: "a", to: "b" },
    { from: "b", to: "c", label: "pass" },
    { from: "c", to: "d" },
    { from: "b", to: "e", label: "block", branch: true },
  ]);

  // Build SVG content
  let svgContent = "";

  // Draw edges first (behind nodes)
  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const fromPos = nodePos[edge.from];
    const toPos   = nodePos[edge.to];
    if (!fromPos || !toPos) continue;

    const nodeOpacity = Math.min(1, ease3((t - (i + 1) * 0.35) / 0.4));
    const isBranch = edge.branch;
    const strokeColor = isBranch ? "#e06c75" : "rgba(212,180,131,0.5)";

    // Arrow: from right edge of from-node to left edge of to-node (or top/bottom for branch)
    let x1, y1, x2, y2;
    if (isBranch) {
      // Goes downward from bottom of b to top of e
      x1 = fromPos.x + nodeW / 2;
      y1 = fromPos.y + nodeH / 2;
      x2 = toPos.x + nodeW / 2;
      y2 = toPos.y - nodeH / 2;
    } else {
      x1 = fromPos.x + nodeW / 2;
      y1 = fromPos.y;
      x2 = toPos.x - nodeW / 2;
      y2 = toPos.y;
    }

    // Arrow head
    const arrowLen = 10;
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const ax1 = x2 - arrowLen * Math.cos(angle - 0.4);
    const ay1 = y2 - arrowLen * Math.sin(angle - 0.4);
    const ax2 = x2 - arrowLen * Math.cos(angle + 0.4);
    const ay2 = y2 - arrowLen * Math.sin(angle + 0.4);

    svgContent += `<g opacity="${nodeOpacity}">
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${strokeColor}" stroke-width="2.5" stroke-dasharray="${isBranch ? "6,4" : "none"}"/>
      <polygon points="${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}" fill="${strokeColor}"/>
      ${edge.label ? `<text x="${(x1 + x2) / 2 + (isBranch ? 18 : 0)}" y="${(y1 + y2) / 2 - (isBranch ? 0 : 12)}" font-family="${preset.type.code.font}" font-size="${labelFontSize}" fill="${strokeColor}" text-anchor="middle">${edge.label}</text>` : ""}
    </g>`;
  }

  // Draw nodes
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const pos = nodePos[node.id];
    if (!pos) continue;

    const nodeOpacity = Math.min(1, ease3((t - i * 0.35) / 0.45));
    const style = nodeTypeStyle[node.type] || nodeTypeStyle.start;
    const nx = pos.x - nodeW / 2;
    const ny = pos.y - nodeH / 2;

    svgContent += `<g opacity="${nodeOpacity}">
      <rect x="${nx}" y="${ny}" width="${nodeW}" height="${nodeH}" rx="${rx}" ry="${rx}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="2"/>
      <text x="${pos.x}" y="${pos.y + fontSize * 0.35}" font-family="${preset.type.flowNode.font}" font-size="${fontSize}" font-weight="${preset.type.flowNode.weight}" fill="${style.textColor}" text-anchor="middle">${node.label}</text>
    </g>`;
  }

  return `<div style="position:absolute;left:0;top:0;width:${W}px;height:${H}px">
  <svg width="${W}" height="${H}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
    ${svgContent}
  </svg>
</div>`;
}

export function screenshots() {
  return [
    { t: 0.5, label: "first node" },
    { t: 2, label: "mid — edges visible" },
    { t: 7, label: "all visible" },
  ];
}

export function lint(params) {
  return { ok: true, errors: [] };
}
