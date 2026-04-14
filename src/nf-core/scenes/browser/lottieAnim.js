import { drawBrowserScene } from "../_browser-scenes.js";

export function lottieAnim(t, params = {}, ctx) {
  drawBrowserScene(ctx, "lottieAnim", params, {
    t,
    title: "[Lottie not cached]",
    lines: ["Bake this frame first.", "Actual Lottie baking requires internet for the CDN fetch."],
    note: "If params.src is missing, bake-browser will generate a placeholder preview card instead.",
  });
}
