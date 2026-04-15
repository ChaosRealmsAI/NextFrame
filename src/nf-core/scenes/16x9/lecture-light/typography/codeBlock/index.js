import { getTokens } from '../../tokens.js';

const meta = {
  id: 'codeBlock', label: 'Code Block', category: 'typography', ratio: '16:9',
  params: { code: { type: 'string', required: true }, lang: { type: 'string', default: 'js' }, filename: { type: 'string', default: '' } },
};

function render(t, params, vp) {
  const T = getTokens();
  const code = params.code || '';
  const filename = params.filename || '';
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<div style="
    position:absolute;
    top:${T.contentY}px; left:${T.padding}px;
    width:${T.contentWidth}px; height:${T.contentHeight}px;
    display:flex; flex-direction:column; justify-content:center;
  ">
    <div style="
      background:${T.codeBg}; border-radius:${T.radiusLarge};
      padding:32px; box-shadow:${T.shadow};
      max-width:1200px;
    ">
      ${filename ? `<div style="
        color:${T.codeComment}; font:400 14px ${T.fontCode};
        margin-bottom:16px; padding-bottom:12px;
        border-bottom:1px solid rgba(255,255,255,0.1);
      ">${filename}</div>` : ''}
      <pre style="
        margin:0; color:${T.codeText}; font:400 ${T.codeSize} ${T.fontCode};
        line-height:1.6; white-space:pre-wrap; overflow:hidden;
      ">${escaped}</pre>
    </div>
  </div>`;
}

function screenshots() {
  return [{ t: 0, params: { code: 'function hello() {\n  console.log("world");\n}', lang: 'js', filename: 'example.js' } }];
}
export { meta, render, screenshots };
