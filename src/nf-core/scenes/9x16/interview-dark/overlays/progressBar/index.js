import { getTokens } from '../../tokens.js';

const meta = {
  id: 'progressBar9x16',
  label: 'Progress Bar',
  category: 'overlays',
  ratio: '9:16',
  params: {
    duration: { type: 'number', required: true },
  },
};

function render(t, params, vp) {
  const T = getTokens();
  const dur = params.duration || 60;
  const progress = Math.min(1, Math.max(0, t / dur));
  const barWidth = T.contentWidth;
  const knobX = progress * barWidth;

  return `<div style="
    position:absolute;
    top:${T.progressY}px; left:${T.padding}px;
    width:${barWidth}px; height:20px;
    display:flex; align-items:center;
  ">
    <div style="
      position:absolute;
      width:100%; height:${T.progressHeight}px;
      background:${T.bgCard};
      border-radius:3px;
    "></div>
    <div style="
      position:absolute;
      width:${knobX}px; height:${T.progressHeight}px;
      background:${T.accent};
      border-radius:3px;
    "></div>
    <div style="
      position:absolute;
      left:${knobX - 6}px;
      width:12px; height:12px;
      background:${T.accent};
      border-radius:50%;
    "></div>
  </div>`;
}

function screenshots() {
  return [
    { t: 0, params: { duration: 60 } },
    { t: 30, params: { duration: 60 } },
  ];
}

export { meta, render, screenshots };
