import { getTokens } from '../../tokens.js';

const meta = {
  id: 'bilingualSub',
  label: 'Bilingual Subtitle',
  category: 'overlays',
  ratio: '9:16',
  params: {
    segments: { type: 'array', required: true },
  },
};

// Two-level subtitle lookup: segment → en, cn[] → zh
function findActiveSub(segments, t) {
  if (!Array.isArray(segments)) return null;
  for (const seg of segments) {
    if (t < seg.s || t >= seg.e) continue;
    const en = seg.en || '';
    const speaker = seg.speaker || '';
    let cn = '';
    if (Array.isArray(seg.cn)) {
      for (const sub of seg.cn) {
        if (t >= sub.s && t < sub.e) {
          cn = sub.text || '';
          break;
        }
      }
    }
    return { en, cn, speaker };
  }
  return null;
}

function render(t, params, vp) {
  const T = getTokens();
  const segments = params.segments;
  const active = findActiveSub(segments, t);
  if (!active) return '<div></div>';

  const cnText = active.cn || '';
  const enText = active.en || '';

  return `<div style="
    position:absolute;
    top:${T.subY}px; left:${T.padding}px;
    width:${T.contentWidth}px; height:${T.subHeight}px;
    display:flex; flex-direction:column; justify-content:flex-start;
    padding-top:24px;
  ">
    ${cnText ? `<div style="
      color:${T.cnSub}; font:${T.cnSubWeight} ${T.cnSubSize} ${T.fontCn};
      line-height:1.4; margin-bottom:16px;
    ">${cnText}</div>` : ''}
    ${enText ? `<div style="
      color:${T.enSub}; font:400 ${T.enSubSize} ${T.fontEn};
      font-style:italic; line-height:1.5;
    ">${enText}</div>` : ''}
  </div>`;
}

function screenshots() {
  return [{ t: 1, params: { segments: [{ s: 0, e: 10, en: 'So we talked three years ago.', speaker: 'dwarkesh', cn: [{ text: '我们三年前谈过一次。', s: 0, e: 5 }] }] } }];
}

export { meta, render, screenshots };
