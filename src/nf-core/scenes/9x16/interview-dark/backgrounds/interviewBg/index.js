import { getTokens } from '../../tokens.js';

const meta = {
  id: 'interviewBg',
  label: 'Interview Background',
  category: 'backgrounds',
  ratio: '9:16',
};

function render(t, params, vp) {
  const T = getTokens();
  return `<div style="
    position:absolute; inset:0;
    background: ${T.bg};
  ">
    <div style="
      position:absolute; inset:0;
      background:
        linear-gradient(${T.border} 1px, transparent 1px),
        linear-gradient(90deg, ${T.border} 1px, transparent 1px);
      background-size: 120px 120px;
      opacity: 0.3;
    "></div>
    <div style="
      position:absolute;
      top: -200px; left: -200px;
      width: 600px; height: 600px;
      background: radial-gradient(circle, ${T.accent}10 0%, transparent 70%);
    "></div>
    <div style="
      position:absolute;
      bottom: -200px; right: -200px;
      width: 600px; height: 600px;
      background: radial-gradient(circle, ${T.accent}08 0%, transparent 70%);
    "></div>
  </div>`;
}

function screenshots() {
  return [{ t: 0, params: {} }];
}

export { meta, render, screenshots };
