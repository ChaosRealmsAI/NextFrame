import breathe from "../../behaviors/continuous/breathe.js";
import slideInUp from "../../behaviors/entrance/slideInUp.js";
import slideInLeft from "../../behaviors/entrance/slideInLeft.js";
import popIn from "../../behaviors/entrance/popIn.js";
import fadeIn from "../../behaviors/entrance/fadeIn.js";

// TODO: extend showcase cadence if nf-anim adds first-class typewriter primitive
const meta = {
  id: "showcaseA_brandHero",
  ratio: "any",
  duration_hint: 5,
  type: "motion",
  category: "hero",
  description: "Apple-keynote brand hero: radial gradient bg + logo burst + circle→star path morph + masked wordmark reveal + glow badge + sparkle burst + breathing loop",
  params: [
    { name: "brand", type: "string", default: "NextFrame" },
    { name: "version", type: "string", default: "v1.0" },
    { name: "tagline", type: "string", default: "AI-native video engine" },
    { name: "bottom", type: "string", default: "Ship video at the speed of code." },
  ],
  examples: [{ brand: "NextFrame", version: "v1.0", tagline: "AI-native video engine", bottom: "Ship video at the speed of code." }],
};

// Anthropic warm palette — single source of truth for this scene
const INK = "#1a1614", WARM = "#da7756", DEEP = "#b8593e", CREAM = "#f5ece0",
      SOFT = "#fffbeb", HALO = "#ffd1b8", PINK = "#ff5577", GOLD = "#ffd166", MUTED = "#7a6a5e";

// Circle → star morph (path-level, sampled by lerpPath)
const CIRCLE_D = "M 0 -46 C 25.4 -46 46 -25.4 46 0 C 46 25.4 25.4 46 0 46 C -25.4 46 -46 25.4 -46 0 C -46 -25.4 -25.4 -46 0 -46 Z";
const STAR_D   = "M 0 -46 L 13 -14 L 45 -14 L 20 6 L 29 38 L 0 20 L -29 38 L -20 6 L -45 -14 L -13 -14 Z";

export default {
  ...meta,
  render(host, t, p = {}, vp = { width: 480, height: 300 }) {
    const W = vp.width || 480, H = vp.height || 300, S = Math.min(W, H);
    const cx = W * 0.5, cy = H * 0.42;
    const brand = p.brand ?? "NextFrame";
    const version = p.version ?? "v1.0";
    const tagline = p.tagline ?? "AI-native video engine";
    const bottom = p.bottom ?? "Ship video at the speed of code.";
    const logoR = S * 0.11;
    const brandFont = S * 0.12;
    const taglineFont = S * 0.038;
    const bottomFont = S * 0.032;
    const brandY = H * 0.66;
    const taglineY = H * 0.79;
    const bottomY = H * 0.92;
    // slide distance for wordmark sweep-in (fraction of viewport)
    const sweepDist = S * 0.25;

    return {
      duration: 5.0, size: [W, H],
      layers: [
        // 0a) solid cream wash (instant — ensures no white flash while mask scans)
        { shape: "rect", at: [cx, H * 0.5], width: W, height: H, fill: SOFT,
          tracks: { opacity: [[0, 0], [0.15, 1, "out"]] } },
        // 0b) radial gradient layer — revealed via expanding rect MASK (scan-in left→right)
        //     Mask bbox = full rect, so mask content in local coords is fully within region.
        { shape: "rect", at: [cx, H * 0.5], width: W, height: H,
          fill: { type: "radial", cx: 0.5, cy: 0.42, r: 0.75,
                  stops: [{ offset: 0, color: HALO }, { offset: 0.55, color: CREAM }, { offset: 1, color: SOFT }] },
          mask: { shape: "rect", at: [-W / 2, -H / 2], width: 0, height: H,
                  tracks: { width: [[0.1, 0], [0.6, W, "outCubic"]] } } },

        // 1) soft warm halo underlay — blooms and holds (color-interp fill warm→halo)
        { shape: "circle", at: [cx, cy], radius: logoR * 2.4, fill: HALO,
          tracks: {
            opacity: [[0.2, 0], [0.7, 0.55, "outCubic"], [5, 0.55]],
            scale:   [[0.2, 0.6], [0.8, 1, "outBack"]],
            fill:    [[0.2, WARM], [0.8, HALO, "inOutCubic"]],
          } },

        // 2) logo — circle → star path morph, radial gradient fill, glow wrap, breathe loop
        { shape: "path", at: [cx, cy], path: CIRCLE_D,
          fill: { type: "radial", cx: 0.35, cy: 0.35, r: 0.7,
                  stops: [{ offset: 0, color: WARM }, { offset: 1, color: DEEP }] },
          wrap: { glow: { color: WARM, intensity: 0.55, spread: 10 } },
          tracks: {
            opacity: [[0.2, 0], [0.6, 1, "outBack"]],
            scale:   [[0.2, 0.2], [0.55, 1.18, "outBack"], [0.8, 1.0, "inOut"]],
            rotate:  [[0.6, 0], [1.2, 72, "inOutCubic"], [5, 72]],
            d:       [[0.6, CIRCLE_D], [1.2, STAR_D, "inOutCubic"]],
          },
          behaviors: [breathe(4.0, 1.0, { scale: 0.05, opacity: 0.08 })] },

        // 3) wordmark "NextFrame" — slide-in from left with fade (keynote-style entrance)
        //    Color-interp: muted → ink (fill track), gives subtle inking effect
        { shape: "text", at: [cx, brandY], text: brand,
          fill: INK, font: "Georgia, serif", fontSize: brandFont, weight: 700, letterSpacing: S * 0.002,
          tracks: { fill: [[1.2, MUTED], [1.8, INK, "out"]] },
          behaviors: [slideInLeft(1.2, 0.7, { distance: sweepDist })] },
        // 3b) accent underscore that grows under the wordmark (rect width track)
        { shape: "rect", at: [cx, brandY + brandFont * 0.7], width: 1, height: 1.5, fill: WARM,
          tracks: {
            opacity: [[1.5, 0], [1.8, 0.9, "out"]],
            width:   [[1.5, 1], [2.1, brandFont * 3, "outCubic"]],
          } },

        // 4) "v1.0" badge — top-right of logo, pink glow wrap, color interp gold→pink
        { shape: "capsule", at: [cx + logoR * 1.15, cy - logoR * 1.05], width: S * 0.11, height: S * 0.045,
          fill: GOLD,
          wrap: { glow: { color: PINK, intensity: 0.7, spread: 8 } },
          tracks: {
            opacity: [[1.7, 0], [2.1, 1, "outBack"]],
            scale:   [[1.7, 0.3], [2.05, 1.2, "outBack"], [2.3, 1.0, "inOut"]],
            fill:    [[1.8, GOLD], [2.6, PINK, "inOutCubic"]],
          } },
        { shape: "text", at: [cx + logoR * 1.15, cy - logoR * 1.05], text: version,
          fill: INK, font: "Georgia, serif", fontSize: S * 0.028, weight: 700,
          tracks: { opacity: [[1.9, 0], [2.2, 1, "out"]] } },

        // 5) tagline — fade-in with slight slide (muted sans-serif, classic subtitle beat)
        { shape: "text", at: [cx, taglineY], text: tagline,
          fill: MUTED, font: "system-ui, sans-serif", fontSize: taglineFont, weight: 500, letterSpacing: S * 0.002,
          behaviors: [fadeIn(2.3, 0.7), slideInUp(2.3, 0.7, { distance: S * 0.02 })] },

        // 6) 8-particle sparkle burst — gold→pink color track, hidden pre-start
        { type: "burst", at: [cx, cy], shape: "sparkle", particles: 8,
          distance: S * 0.42, radius: S * 0.018,
          startAt: 3.0, duration: 0.9, opacity: 1.0,
          tracks: {
            opacity: [[0, 0], [2.98, 0], [3.0, 1, "out"], [3.9, 0, "outExpo"]],
            fill:    [[3.0, GOLD], [3.9, PINK, "inOutCubic"]],
          } },

        // 7) bottom tagline — slide up, muted, shadow effect wrap (blur effect via glow coverage)
        { shape: "text", at: [cx, bottomY], text: bottom,
          fill: MUTED, font: "Georgia, serif", fontSize: bottomFont, style: "italic",
          wrap: { shadow: { color: DEEP, intensity: 0.3, spread: 4 } },
          behaviors: [slideInUp(3.5, 0.6, { distance: S * 0.04 })] },
      ],
    };
  },
  describe(t, params = {}) {
    return {
      sceneId: meta.id,
      phase: t < 0.6 ? "bg-burst" : t < 1.2 ? "logo-morph" : t < 1.8 ? "wordmark" : t < 2.3 ? "badge" : t < 3.0 ? "tagline" : t < 3.6 ? "sparkles" : t < 4.0 ? "bottom" : "breathe",
      params,
    };
  },
  sample() { return meta.examples[0]; },
};
