import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { markdownToHtml, escapeHtml } from "./_browser-markdown.js";

export function markdownDocument(markdown, theme = "anthropic-warm") {
  const body = markdownToHtml(markdown);
  const themeName = String(theme || "anthropic-warm");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    :root {
      --bg: #1a1510;
      --ink: #f5ece0;
      --accent: #da7756;
      --gold: #d4b483;
      --code-bg: #0d1117;
      --theme-name: "${escapeHtml(themeName)}";
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 100%; height: 100%; }
    body {
      background:
        radial-gradient(circle at top right, rgba(218,119,86,0.20), transparent 32%),
        linear-gradient(180deg, #241d16 0%, var(--bg) 38%, #130f0b 100%);
      color: var(--ink);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .frame {
      width: 100%;
      height: 100%;
      padding: 84px 96px;
      display: flex;
      justify-content: center;
      align-items: stretch;
    }
    article {
      width: 100%;
      border: 1px solid rgba(212,180,131,0.25);
      border-radius: 28px;
      padding: 56px 64px;
      background: rgba(8, 8, 8, 0.14);
      box-shadow: inset 0 1px 0 rgba(245,236,224,0.05);
    }
    h1, h2 {
      margin: 0 0 20px;
      font-family: Georgia, "Times New Roman", serif;
      line-height: 1.05;
      letter-spacing: -0.03em;
    }
    h1 { font-size: 72px; color: var(--ink); }
    h2 { font-size: 46px; color: var(--gold); margin-top: 32px; }
    p, li, blockquote {
      font-size: 30px;
      line-height: 1.48;
      margin: 0 0 18px;
    }
    ul { margin: 0 0 24px 0; padding-left: 1.2em; }
    li::marker { color: var(--accent); }
    strong { color: var(--accent); font-weight: 700; }
    code {
      font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
      background: rgba(13,17,23,0.92);
      color: #c9d1d9;
      padding: 0.15em 0.35em;
      border-radius: 10px;
      font-size: 0.85em;
    }
    pre {
      margin: 24px 0;
      padding: 24px 28px;
      border-radius: 18px;
      overflow: hidden;
      background: var(--code-bg);
      border: 1px solid rgba(212,180,131,0.18);
    }
    pre code {
      display: block;
      padding: 0;
      background: transparent;
      white-space: pre-wrap;
      font-size: 24px;
      line-height: 1.45;
    }
    blockquote {
      margin: 28px 0;
      padding: 0 0 0 24px;
      border-left: 4px solid var(--accent);
      color: #e8d9c9;
    }
  </style>
</head>
<body>
  <div class="frame"><article>${body}</article></div>
</body>
</html>`;
}

export function svgDocument(svgMarkup) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background:
        radial-gradient(circle at top, rgba(218,119,86,0.12), transparent 28%),
        linear-gradient(180deg, #19130e 0%, #100c08 100%);
    }
    body {
      display: grid;
      place-items: center;
      padding: 48px;
    }
    .svg-shell {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
    }
    .svg-shell > svg {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div class="svg-shell">${svgMarkup}</div>
</body>
</html>`;
}

export function htmlSlideDocument(html) {
  const content = String(html || "").trim();
  if (/<html[\s>]/i.test(content)) return content;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; width: 100%; height: 100%; }
    body {
      background: #101010;
      color: #f5ece0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
  </style>
</head>
<body>${content}</body>
</html>`;
}

export function lottieDocument(src, frame) {
  const resolvedSrc = src ? resolve(src) : "";
  if (!resolvedSrc || !existsSync(resolvedSrc)) {
    return placeholderDocument("Lottie preview placeholder", [
      "Set params.src to a local Lottie JSON file to bake a real frame.",
      "Actual Lottie rendering requires internet for the lottie-web CDN fetch at bake time.",
      `Requested frame: ${frame}`,
    ]);
  }

  const json = readFileSync(resolvedSrc, "utf8");
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; background: #0f1014; color: #f5ece0; }
    body {
      display: grid;
      place-items: center;
      overflow: hidden;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(46,115,255,0.22), transparent 35%),
        radial-gradient(circle at bottom right, rgba(218,119,86,0.18), transparent 30%),
        #0f1014;
    }
    #stage {
      width: 78vmin;
      height: 78vmin;
      border-radius: 28px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 24px 80px rgba(0,0,0,0.38);
    }
    .caption {
      position: fixed;
      left: 36px;
      bottom: 28px;
      color: rgba(245,236,224,0.82);
      font-size: 18px;
    }
  </style>
</head>
<body>
  <div id="stage"></div>
  <div class="caption">Baked from ${escapeHtml(resolvedSrc)} at frame ${frame}</div>
  <script>
    const animationData = ${json};
    const animation = window.lottie.loadAnimation({
      container: document.getElementById("stage"),
      renderer: "svg",
      loop: false,
      autoplay: false,
      animationData,
    });
    animation.addEventListener("DOMLoaded", () => {
      animation.goToAndStop(${frame}, true);
      document.body.setAttribute("data-ready", "1");
    });
  </script>
</body>
</html>`;
}

export function placeholderDocument(title, lines) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; width: 100%; height: 100%; }
    body {
      display: grid;
      place-items: center;
      padding: 52px;
      background:
        radial-gradient(circle at top, rgba(218,119,86,0.18), transparent 28%),
        linear-gradient(180deg, #1b1611 0%, #0f0d0a 100%);
      color: #f5ece0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card {
      width: 100%;
      height: 100%;
      border-radius: 28px;
      border: 1px solid rgba(212,180,131,0.25);
      display: grid;
      place-items: center;
      text-align: center;
      padding: 48px;
      box-sizing: border-box;
      background: rgba(255,255,255,0.03);
    }
    h1 {
      margin: 0 0 24px;
      color: #da7756;
      font-size: 60px;
      line-height: 1.05;
    }
    p {
      margin: 0 0 14px;
      font-size: 28px;
      line-height: 1.45;
    }
  </style>
</head>
<body>
  <div class="card">
    <div>
      <h1>${escapeHtml(title)}</h1>
      ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}
    </div>
  </div>
</body>
</html>`;
}
