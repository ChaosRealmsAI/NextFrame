// HTML harness generator — creates a minimal HTML page that the Rust recorder
// can open in WKWebView to render frames via the DOM engine.
import type { Timeline } from "nf-core/types.js";

interface HarnessOpts {
  width?: number;
  height?: number;
}

export function generateHarness(timeline: Timeline, opts: HarnessOpts = {}): string {
  const width = opts.width ?? timeline.project?.width ?? 1920;
  const height = opts.height ?? timeline.project?.height ?? 1080;
  const timelineJson = JSON.stringify(timeline);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: #000; }
  #canvas { width: ${width}px; height: ${height}px; }
</style>
</head>
<body>
<canvas id="canvas" width="${width}" height="${height}"></canvas>
<script>
window.__NF_TIMELINE__ = ${timelineJson};
window.__NF_WIDTH__ = ${width};
window.__NF_HEIGHT__ = ${height};
</script>
</body>
</html>`;
}
