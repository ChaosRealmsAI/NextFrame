// Component: [NAME]
// Theme: [THEME]
// Category: [CATEGORY]
//
// Before writing: read ../../design.md and look at sibling components.
// All colors/sizes from ../../tokens.js — no hardcoded hex values.

import { getTokens } from '../../tokens.js';

const meta = {
  id: '[COMPONENT_ID]',
  label: '[Human Name]',
  category: '[CATEGORY]',
  // videoOverlay: false,  // set true if this is a video placeholder
};

function render(t, params, vp) {
  const T = getTokens();
  const w = vp.width;
  const h = vp.height;

  return `<div style="
    position: absolute;
    inset: 0;
    color: ${T.body};
    font-family: ${T.fontCn};
  ">
    <!-- Component content here -->
  </div>`;
}

function screenshots() {
  return [
    { t: 0, params: {} },
    { t: 5, params: {} },
  ];
}

export { meta, render, screenshots };
