import { getTokens } from '../../tokens.js';

const meta = {
  id: 'headline', label: 'Headline', category: 'typography', ratio: '16:9',
  params: { text: { type: 'string', required: true }, subtitle: { type: 'string', default: '' } },
};

function render(t, params, vp) {
  const T = getTokens();
  const text = params.text || '';
  const subtitle = params.subtitle || '';

  return `<div style="
    position:absolute;
    top:${T.titleY}px; left:${T.padding}px;
    width:${T.contentWidth}px; height:${T.titleHeight}px;
    display:flex; flex-direction:column; justify-content:center;
  ">
    <div style="color:${T.title}; font:${T.titleWeight} ${T.titleSize} ${T.fontEn}; line-height:1.2;">${text}</div>
    ${subtitle ? `<div style="color:${T.bodyDim}; font:${T.subtitleWeight} ${T.subtitleSize} ${T.fontEn}; margin-top:8px;">${subtitle}</div>` : ''}
  </div>`;
}

function screenshots() { return [{ t: 0, params: { text: 'How AI Agents Work', subtitle: 'A technical deep-dive' } }]; }
export { meta, render, screenshots };
