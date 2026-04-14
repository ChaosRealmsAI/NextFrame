import { drawBrowserScene } from "./_browser-scenes.js";

export function svgOverlay(t, params = {}, ctx) {
  drawBrowserScene(ctx, "svgOverlay", params, {
    t,
    title: "[SVG not cached]",
    lines: ["Run `nextframe bake-browser <timeline.json>` to bake browser scenes."],
  });
}
