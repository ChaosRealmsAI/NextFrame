import { getTokens } from '../../tokens.js';

const meta = {
  id: 'interviewHeader',
  label: 'Interview Header',
  category: 'typography',
  ratio: '9:16',
  params: {
    series: { type: 'string', required: true },
    episode: { type: 'string', required: true },
    title: { type: 'string', required: true },
    guest: { type: 'string', default: '' },
  },
};

function render(t, params, vp) {
  const T = getTokens();
  const series = params.series || '';
  const episode = params.episode || '';
  const title = params.title || '';
  const guest = params.guest || '';

  return `<div style="
    position:absolute;
    top:${T.headerY}px; left:${T.padding}px;
    width:${T.contentWidth}px; height:${T.headerHeight}px;
    display:flex; flex-direction:column; justify-content:flex-start;
  ">
    <div style="display:flex; align-items:center; gap:16px; margin-bottom:8px;">
      <span style="
        color:${T.accent}; font:${T.subtitleWeight} ${T.subtitleSize} ${T.fontCn};
      ">${series}</span>
      <span style="
        color:${T.bodyDim}; font:400 ${T.subtitleSize} ${T.fontEn};
      ">${episode}</span>
    </div>
    <div style="
      color:${T.title}; font:${T.titleWeight} ${T.titleSize} ${T.fontCn};
      line-height:1.2; margin-bottom:8px;
    ">${title}</div>
    ${guest ? `<div style="
      color:${T.body}; font:${T.bodyWeight} ${T.subtitleSize} ${T.fontCn};
    ">${guest}</div>` : ''}
  </div>`;
}

function screenshots() {
  return [{ t: 0, params: { series: '速通硅谷访谈', episode: 'E01', title: '指数快到头了', guest: 'Dario Amodei' } }];
}

export { meta, render, screenshots };
