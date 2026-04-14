export const meta = {
  id: "demoProgress",
  version: 1,
  ratio: "16:9",
  category: "overlays",
  label: "Demo Progress Bar",
  description: "底部进度条，显示当前播放位置和阶段标签。全程覆盖。",
  tech: "dom",
  duration_hint: 30,
  loopable: false,
  z_hint: "top",
  tags: ["progress", "hud", "overlay", "demo", "timeline"],
  mood: ["professional"],
  theme: ["tech", "minimal", "dark"],
  default_theme: "blue-glow",
  themes: {
    "blue-glow":  { barBg: "rgba(0,0,0,0.6)", fillColor: "#4fc3f7", trackColor: "rgba(255,255,255,0.12)", textColor: "#e0f7fa", dotColor: "#4fc3f7" },
    "green-glow": { barBg: "rgba(0,0,0,0.6)", fillColor: "#69f0ae", trackColor: "rgba(255,255,255,0.12)", textColor: "#e8f5e9", dotColor: "#69f0ae" },
    "amber-glow": { barBg: "rgba(0,0,0,0.6)", fillColor: "#ffb74d", trackColor: "rgba(255,255,255,0.12)", textColor: "#fff8e1", dotColor: "#ffb74d" },
  },
  params: {
    barBg:      { type: "string", default: "rgba(0,0,0,0.6)", label: "条背景", semantic: "progress bar strip background", group: "color" },
    fillColor:  { type: "string", default: "#4fc3f7", label: "进度填充", semantic: "filled portion of progress bar", group: "color" },
    trackColor: { type: "string", default: "rgba(255,255,255,0.12)", label: "轨道颜色", semantic: "unfilled track portion", group: "color" },
    textColor:  { type: "string", default: "#e0f7fa", label: "文字颜色", semantic: "label text color", group: "color" },
    dotColor:   { type: "string", default: "#4fc3f7", label: "节点颜色", semantic: "phase marker dot color", group: "color" },
    totalDur:   { type: "number", default: 30, range: [5, 120], step: 1, label: "总时长(秒)", semantic: "total video duration, used to calculate fill %", group: "timing" },
  },
  ai: {
    when: "全程覆盖在最顶层，显示播放进度",
    how: "z-index 最高，start=0 dur=全视频时长，totalDur 设为视频总秒数",
    example: { barBg: "rgba(0,0,0,0.6)", fillColor: "#4fc3f7", trackColor: "rgba(255,255,255,0.12)", textColor: "#e0f7fa", dotColor: "#4fc3f7", totalDur: 30 },
    theme_guide: { "blue-glow": "蓝色光晕", "green-glow": "绿色光晕", "amber-glow": "琥珀光晕" },
    avoid: "不要和其他进度条叠加",
    pairs_with: ["demoBg", "demoBarSvg", "demoParticles", "demoCompareCards", "demoCodeBlock"],
  },
};

export function render(t, params, vp) {
  const { barBg, fillColor, trackColor, textColor, dotColor, totalDur } = params;
  const W = vp.width, H = vp.height;

  const progress = Math.min(1, Math.max(0, t / totalDur));
  const fillW = Math.round(W * progress);

  const barH = Math.round(H * 0.007);
  const barY = Math.round(H - barH - H * 0.012);
  const labelY = barY - Math.round(H * 0.012);
  const fs = Math.round(W * 0.012);

  // Phase markers
  const phases = [
    { at: 0,    label: "SVG数据" },
    { at: 7/30, label: "粒子" },
    { at: 14/30, label: "卡片" },
    { at: 21/30, label: "代码" },
  ];

  const dots = phases.map(ph => {
    const x = Math.round(W * ph.at);
    const isActive = progress >= ph.at;
    return `<div style="position:absolute;left:${x}px;top:${barY - Math.round(H * 0.008)}px;
      width:${Math.round(H * 0.018)}px;height:${Math.round(H * 0.018)}px;
      border-radius:50%;background:${isActive ? dotColor : trackColor};
      transform:translateX(-50%);
      box-shadow:${isActive ? `0 0 ${Math.round(W * 0.004)}px ${dotColor}` : 'none'}"></div>
    <div style="position:absolute;left:${x}px;top:${labelY - Math.round(H * 0.022)}px;
      transform:translateX(-50%);color:${isActive ? dotColor : textColor};
      font-size:${fs}px;font-family:system-ui,sans-serif;opacity:${isActive ? 0.9 : 0.4};
      white-space:nowrap">${ph.label}</div>`;
  }).join('');

  const timeStr = `${Math.floor(t / 60).toString().padStart(2, '0')}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
  const totalStr = `${Math.floor(totalDur / 60).toString().padStart(2, '0')}:${Math.floor(totalDur % 60).toString().padStart(2, '0')}`;

  return `<div style="position:absolute;inset:0;width:${W}px;height:${H}px;pointer-events:none">
  <div style="position:absolute;left:0;right:0;bottom:0;height:${Math.round(H * 0.08)}px;background:${barBg}">
    ${dots}
    <div style="position:absolute;left:0;right:0;top:${barY}px;height:${barH}px;background:${trackColor}">
      <div style="width:${fillW}px;height:100%;background:${fillColor};box-shadow:0 0 ${Math.round(H * 0.006)}px ${fillColor}80"></div>
    </div>
    <div style="position:absolute;right:${Math.round(W * 0.012)}px;bottom:${Math.round(H * 0.012)}px;
      color:${textColor};font-size:${fs}px;font-family:monospace;opacity:0.7">${timeStr} / ${totalStr}</div>
  </div>
</div>`;
}

export function screenshots() {
  return [
    { t: 0, label: "开始" },
    { t: 15, label: "中间" },
    { t: 29, label: "结尾" },
  ];
}

export function lint(params, vp) {
  const errors = [];
  if (params.totalDur < 1) errors.push("totalDur 必须大于 1");
  return { ok: errors.length === 0, errors };
}
