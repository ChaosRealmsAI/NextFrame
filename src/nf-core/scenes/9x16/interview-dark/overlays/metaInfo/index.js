import { getTokens } from '../../tokens.js';

const meta = {
  id: 'metaInfo',
  label: 'Meta Info Bar',
  category: 'overlays',
  ratio: '9:16',
  params: {
    origRange: { type: 'string', required: true },
    topic: { type: 'string', required: true },
    tags: { type: 'string', required: true },
  },
};

function render(t, params, vp) {
  const T = getTokens();
  const origRange = params.origRange || '';
  const topic = params.topic || '';
  const tags = (params.tags || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean);

  const tagHtml = tags.map(function(tag) {
    return `<span style="
      display:inline-block; padding:4px 12px;
      background:${T.bgCard}; border:1px solid ${T.border};
      border-radius:${T.radiusSmall};
      color:${T.body}; font:400 ${T.tagSize} ${T.fontEn};
    ">${tag}</span>`;
  }).join(' ');

  return `<div style="
    position:absolute;
    top:${T.metaY}px; left:${T.padding}px;
    width:${T.contentWidth}px; height:${T.metaHeight}px;
    display:flex; flex-direction:column; gap:10px;
  ">
    <div style="color:${T.bodyDim}; font:400 ${T.labelSize} ${T.fontCn};">${origRange}</div>
    <div style="
      color:${T.bodyDim}; font:${T.labelWeight} ${T.labelSize} ${T.fontCn};
      text-transform:uppercase; letter-spacing:2px;
    ">TOPIC</div>
    <div style="color:${T.body}; font:400 ${T.bodySize} ${T.fontCn};">${topic}</div>
    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:4px;">
      ${tagHtml}
    </div>
  </div>`;
}

function screenshots() {
  return [{ t: 0, params: { origRange: '原片 2:22:18 | 内容来源 00:00 — 01:21', topic: 'Dario: 技术指数如期而至', tags: 'Dwarkesh Podcast,Dario Amodei,原声 1:21' } }];
}

export { meta, render, screenshots };
