import { getTokens } from '../../tokens.js';

const meta = {
  id: 'barChart', label: 'Bar Chart', category: 'data', ratio: '16:9',
  params: {
    title: { type: 'string', default: '' },
    data: { type: 'array', required: true },
    maxValue: { type: 'number', default: 0 },
  },
};

function render(t, params, vp) {
  const T = getTokens();
  const title = params.title || '';
  const data = Array.isArray(params.data) ? params.data : [];
  const maxVal = params.maxValue || Math.max(1, ...data.map(function(d) { return d.value || 0; }));
  const barColors = [T.dataPrimary, T.dataSecondary, T.dataTertiary, T.accent];
  const chartWidth = 1200;
  const chartHeight = 500;
  const barGap = 24;
  const barWidth = data.length > 0 ? Math.min(120, (chartWidth - barGap * (data.length + 1)) / data.length) : 60;

  const barsHtml = data.map(function(d, i) {
    const val = d.value || 0;
    const label = d.label || '';
    const pct = Math.min(1, val / maxVal);
    const barH = pct * (chartHeight - 60);
    const color = barColors[i % barColors.length];
    const x = barGap + i * (barWidth + barGap);

    return `<div style="
      position:absolute; bottom:40px; left:${x}px;
      width:${barWidth}px; display:flex; flex-direction:column; align-items:center;
    ">
      <div style="
        color:${T.body}; font:500 16px ${T.fontEn};
        margin-bottom:8px;
      ">${val}</div>
      <div style="
        width:100%; height:${barH}px;
        background:${color}; border-radius:${T.radiusSmall} ${T.radiusSmall} 0 0;
      "></div>
      <div style="
        color:${T.bodyDim}; font:400 14px ${T.fontEn};
        margin-top:8px; text-align:center;
      ">${label}</div>
    </div>`;
  }).join('');

  return `<div style="
    position:absolute;
    top:${T.contentY}px; left:${T.padding}px;
    width:${T.contentWidth}px; height:${T.contentHeight}px;
    display:flex; flex-direction:column; align-items:center; justify-content:center;
  ">
    ${title ? `<div style="color:${T.title}; font:600 ${T.subtitleSize} ${T.fontEn}; margin-bottom:24px;">${title}</div>` : ''}
    <div style="
      position:relative; width:${chartWidth}px; height:${chartHeight}px;
      background:${T.bgCard}; border-radius:${T.radius}; box-shadow:${T.shadow};
      padding:20px;
    ">
      <div style="
        position:absolute; bottom:40px; left:20px; right:20px;
        height:1px; background:${T.gridColor};
      "></div>
      ${barsHtml}
    </div>
  </div>`;
}

function screenshots() {
  return [{ t: 0, params: { title: 'Performance Comparison', data: [{ label: 'GPT-4', value: 86 }, { label: 'Claude', value: 92 }, { label: 'Gemini', value: 78 }] } }];
}
export { meta, render, screenshots };
