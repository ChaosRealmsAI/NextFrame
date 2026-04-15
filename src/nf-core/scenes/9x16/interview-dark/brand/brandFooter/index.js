import { getTokens } from '../../tokens.js';

const meta = {
  id: 'brandFooter',
  label: 'Brand Footer',
  category: 'brand',
  ratio: '9:16',
};

function render(t, params, vp) {
  const T = getTokens();

  return `<div style="
    position:absolute;
    top:${T.brandY}px; left:${T.padding}px;
    width:${T.contentWidth}px; height:${T.brandHeight}px;
    display:flex; flex-direction:column; justify-content:center; align-items:flex-start;
  ">
    <div style="
      color:${T.body};
      font:${T.brandWeight} ${T.brandSize} ${T.fontEn};
      letter-spacing:${T.brandLetterSpacing};
    ">NEXTFRAME</div>
    <div style="
      color:${T.bodyDim};
      font:300 16px ${T.fontEn};
      letter-spacing:4px; margin-top:8px;
    ">AI-NATIVE VIDEO ENGINE</div>
  </div>`;
}

function screenshots() {
  return [{ t: 0, params: {} }];
}

export { meta, render, screenshots };
