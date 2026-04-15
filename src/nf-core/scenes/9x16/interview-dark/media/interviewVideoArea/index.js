import { getTokens } from '../../tokens.js';

const meta = {
  id: 'interviewVideoArea',
  label: 'Interview Video Area',
  category: 'media',
  ratio: '9:16',
  videoOverlay: true,
  params: {
    src: { type: 'string', required: true },
    clipNum: { type: 'number', default: 1 },
    totalClips: { type: 'number', default: 1 },
  },
};

function render(t, params, vp) {
  const T = getTokens();
  const clipNum = params.clipNum || 1;
  const totalClips = params.totalClips || 1;

  return `<div style="
    position:absolute;
    top:${T.videoY}px; left:${T.videoX}px;
    width:${T.videoWidth}px; height:${T.videoHeight}px;
    background:${T.bgCard};
    border:1px solid ${T.border};
    border-radius:${T.radius};
    overflow:hidden;
  ">
    <div style="
      position:absolute; top:12px; right:16px;
      color:${T.bodyDim}; font:400 16px ${T.fontEn};
      background:rgba(0,0,0,0.5); padding:4px 10px; border-radius:${T.radiusSmall};
    ">${clipNum}/${totalClips}</div>
  </div>`;
}

function screenshots() {
  return [{ t: 0, params: { src: '/tmp/test.mp4', clipNum: 1, totalClips: 3 } }];
}

export { meta, render, screenshots };
