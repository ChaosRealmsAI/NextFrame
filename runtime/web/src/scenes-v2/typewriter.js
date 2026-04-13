import {
  createRoot, createNode, smoothstep, toNumber,
  MONO_FONT_STACK,
} from "../scenes-v2-shared.js";

export default {
  id: "typewriter",
  type: "dom",
  name: "Typewriter",
  category: "Typography",
  defaultParams: {
    text: "Hello, World!",
    fontSize: 32,
    speed: 20,
    cursor: true,
    cursorColor: "#6ee7ff",
  },

  create(container, params) {
    const root = createRoot(container, "display:flex;align-items:center;justify-content:center;padding:40px");
    const fontSize = toNumber(params.fontSize, 32);
    const cursorColor = params.cursorColor || "#6ee7ff";

    const wrap = createNode("div", [
      "display:inline-flex;align-items:baseline",
      `font-family:${MONO_FONT_STACK}`,
      `font-size:${fontSize}px`,
      "color:#fff;line-height:1.5",
      "will-change:opacity",
    ].join(";"));

    const textSpan = createNode("span", "white-space:pre-wrap;word-break:break-word");
    const cursorSpan = createNode("span", [
      `color:${cursorColor}`,
      "font-weight:400;margin-left:1px",
      "will-change:opacity",
    ].join(";"), "\u2588");

    wrap.appendChild(textSpan);
    if (params.cursor !== false) wrap.appendChild(cursorSpan);
    root.appendChild(wrap);

    return { root, textSpan, cursorSpan, fullText: String(params.text || "Hello, World!") };
  },

  update(els, localT, params) {
    const fadeIn = smoothstep(0, 0.05, localT);
    const fadeOut = 1 - smoothstep(0.85, 1, localT);
    els.root.style.opacity = fadeIn * fadeOut;

    const speed = toNumber(params.speed, 20);
    const totalChars = els.fullText.length;
    // Map localT (0~1) to typing progress
    const typeDuration = totalChars / speed; // seconds at this speed
    const normalizedSpeed = typeDuration > 0 ? 1 / typeDuration : 10;
    // Typing happens between 0.05 and 0.8
    const typeT = smoothstep(0.05, 0.05 + 0.75 * (totalChars / (speed * 4 + totalChars)), localT);
    const charCount = Math.min(totalChars, Math.floor(typeT * (totalChars + 1)));

    els.textSpan.textContent = els.fullText.slice(0, charCount);

    // Cursor blink (using localT as a proxy for time)
    if (els.cursorSpan) {
      const blink = Math.sin(localT * 80) > 0 ? 1 : 0.15;
      const showCursor = charCount < totalChars ? 1 : blink;
      els.cursorSpan.style.opacity = showCursor;
    }
  },

  destroy(els) { els.root.remove(); },
};
