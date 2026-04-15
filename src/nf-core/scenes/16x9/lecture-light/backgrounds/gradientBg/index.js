import { getTokens } from '../../tokens.js';

const meta = { id: 'gradientBg', label: 'Gradient Background', category: 'backgrounds', ratio: '16:9' };

function render(t, params, vp) {
  const T = getTokens();
  return `<div style="
    position:absolute; inset:0;
    background: linear-gradient(160deg, ${T.bg} 0%, ${T.bgCard} 50%, ${T.bg} 100%);
  ">
    <div style="
      position:absolute; inset:0;
      background: radial-gradient(ellipse at 20% 50%, ${T.accent}08 0%, transparent 50%);
    "></div>
  </div>`;
}

function screenshots() { return [{ t: 0, params: {} }]; }
export { meta, render, screenshots };
