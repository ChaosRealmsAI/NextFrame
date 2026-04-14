import { drawBrowserScene } from "../_browser-scenes.js";

export function markdownSlide(t, params = {}, ctx) {
  drawBrowserScene(ctx, "markdownSlide", params, {
    t,
    title: "[Markdown not cached]",
    lines: ["Bake this slide before rendering frames or exports."],
  });
}
