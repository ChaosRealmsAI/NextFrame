import { getTokens } from '../../tokens.js';

const meta = { id: 'progressBar16x9', label: 'Progress Bar', category: 'overlays', ratio: '16:9', params: { duration: { type: 'number', required: true } } };

function render(t, params, vp) {
  const T = getTokens();
  const dur = params.duration || 30;
  const progress = Math.min(1, Math.max(0, t / dur));

  return `<div style="
    position:absolute;
    top:${T.progressY}px; left:${T.padding}px;
    width:${T.contentWidth}px; height:16px;
    display:flex; align-items:center;
  ">
    <div style="width:100%; height:${T.progressHeight}px; background:${T.border}; border-radius:2px;"></div>
    <div style="position:absolute; width:${progress * T.contentWidth}px; height:${T.progressHeight}px; background:${T.accent}; border-radius:2px;"></div>
    <div style="position:absolute; left:${progress * T.contentWidth - 5}px; width:10px; height:10px; background:${T.accent}; border-radius:50%;"></div>
  </div>`;
}

function screenshots() { return [{ t: 15, params: { duration: 30 } }]; }
export { meta, render, screenshots };
