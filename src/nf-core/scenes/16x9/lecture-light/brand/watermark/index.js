import { getTokens } from '../../tokens.js';

const meta = { id: 'watermark', label: 'Watermark', category: 'brand', ratio: '16:9' };

function render(t, params, vp) {
  const T = getTokens();
  return `<div style="
    position:absolute;
    top:${T.brandY}px; left:${T.padding}px;
    width:${T.contentWidth}px; height:${T.brandHeight}px;
    display:flex; align-items:center;
  ">
    <span style="
      color:${T.bodyDim}; font:${T.brandWeight} ${T.brandSize} ${T.fontEn};
      letter-spacing:${T.brandLetterSpacing}; opacity:0.6;
    ">NEXTFRAME</span>
  </div>`;
}

function screenshots() { return [{ t: 0, params: {} }]; }
export { meta, render, screenshots };
