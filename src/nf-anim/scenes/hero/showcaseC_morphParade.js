import breathe from "../../behaviors/continuous/breathe.js";

// TODO: factor shared morph-path palette out if more showcase scenes want it.
// Each shape is M C C C Z (1 move + 4 cubics + close) → same command count → clean lerp.
const SHAPES = {
  circle: "M0 -80 C44 -80 80 -44 80 0 C80 44 44 80 0 80 C-44 80 -80 44 -80 0 C-80 -44 -44 -80 0 -80 Z",
  heart:  "M0 -44 C40 -96 96 -56 40 -4 C32 8 16 28 0 56 C-16 28 -32 8 -40 -4 C-96 -56 -40 -96 0 -44 Z",
  star:   "M0 -80 C10 -28 28 -24 76 -24 C36 4 24 20 44 68 C8 44 -8 44 -44 68 C-24 20 -36 4 -76 -24 C-28 -24 -10 -28 0 -80 Z",
  hexagon:"M0 -80 C26 -66 52 -52 70 -40 C70 -14 70 14 70 40 C52 52 26 66 0 80 C-26 66 -52 52 -70 40 C-70 14 -70 -14 -70 -40 C-52 -52 -26 -66 0 -80 Z",
  drop:   "M0 -80 C24 -50 54 -12 54 20 C54 54 28 80 0 80 C-28 80 -54 54 -54 20 C-54 -12 -24 -50 0 -80 Z",
};

const meta = {
  id: "showcaseC_morphParade",
  ratio: "any",
  duration_hint: 10,
  type: "motion",
  category: "hero",
  description: "Hypnotic 10s shape morph parade: circle→heart→star→hexagon→drop→circle with synced color + gradient + glow",
  params: [],
  examples: [{}],
};

export default {
  ...meta,
  render(host, t, p = {}, vp = { width: 480, height: 300 }) {
    const W = vp.width || 480, H = vp.height || 300, S = Math.min(W, H);
    const cx = W * 0.5, cy = H * 0.54;
    const pal = { ink: "#1a1614", warm: "#da7756", deep: "#b8593e", cream: "#f5ece0", soft: "#fffbeb", pink: "#ff5577", gold: "#ffd166", muted: "#7a6a5e" };
    const scale = S / 300;
    const names = ["circle", "heart", "star", "hexagon", "drop", "circle"];

    // 6 orbit dots (accent labels) — pulse-highlight when morph passes their phase
    const orbit = names.map((name, i) => {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const r = S * 0.42;
      const tStep = i * 1.5;                // this dot's "moment"
      const lit = [[Math.max(0, tStep - 0.4), 0.25], [tStep, 1, "outCubic"], [tStep + 0.6, 0.35, "outCubic"], [tStep + 1.4, 0.25]];
      return {
        group: [
          { shape: "circle", at: [cx + Math.cos(a) * r, cy + Math.sin(a) * r], radius: S * 0.012,
            fill: pal.warm, tracks: { opacity: lit, scale: [[Math.max(0, tStep - 0.4), [0.7, 0.7]], [tStep, [1.6, 1.6], "outBack"], [tStep + 0.8, [1, 1], "outCubic"]] },
            behaviors: [breathe(0, 2.8 + (i * 0.13), { scale: 0.04, opacity: 0.06 })] },
          { shape: "text", at: [cx + Math.cos(a) * (r + S * 0.06), cy + Math.sin(a) * (r + S * 0.06)], text: name,
            fill: pal.muted, font: "system-ui, sans-serif", fontSize: S * 0.028, weight: 600, textAnchor: "middle",
            tracks: { opacity: [[Math.max(0, tStep - 0.4), 0.35], [tStep, 1, "outCubic"], [tStep + 0.6, 0.55], [tStep + 1.4, 0.35]],
                      fill:    [[Math.max(0, tStep - 0.4), pal.muted], [tStep, pal.ink, "outCubic"], [tStep + 1.4, pal.muted]] } },
        ],
      };
    }).flatMap((e) => e.group);

    // central morphing shape — THE STAR of this scene
    const warmGrad = { type: "linear", dir: "vertical", stops: [{ offset: 0, color: pal.warm }, { offset: 1, color: pal.deep }] };
    const pinkGrad = { type: "linear", dir: "vertical", stops: [{ offset: 0, color: pal.pink }, { offset: 1, color: pal.deep }] };
    // Fill keyframe track — the engine lerps colors string→string. Gradient phases sit as discrete stops bookended by flat holds.
    const fillTrack = [
      [0.0, pal.warm],
      [1.5, pal.warm],
      [1.55, pal.pink],   // pink (stand-in for pink gradient phase)
      [3.0, pal.pink],
      [3.05, pal.gold],
      [4.5, pal.gold],
      [4.55, pal.deep],
      [6.0, pal.deep],
      [6.05, pal.warm],   // warm gradient phase: start color
      [7.5, pal.deep],    // trailing end of warm gradient phase
      [7.55, pal.warm],
      [9.0, pal.warm],
      [10.0, pal.warm],
    ];

    const dTrack = [
      [0.0, SHAPES.circle],
      [1.5, SHAPES.circle, "outCubic"],
      [3.0, SHAPES.heart, "outCubic"],
      [4.5, SHAPES.star, "outCubic"],
      [6.0, SHAPES.hexagon, "outCubic"],
      [7.5, SHAPES.drop, "outCubic"],
      [9.0, SHAPES.circle, "outCubic"],
      [10.0, SHAPES.circle, "linear"],
    ];

    const centerShape = {
      shape: "path", at: [cx, cy],
      tracks: { d: dTrack, fill: fillTrack, scale: [[0, [scale, scale]], [1.5, [scale * 1.04, scale * 1.04]], [3, [scale, scale]], [4.5, [scale * 1.06, scale * 1.06]], [6, [scale, scale]], [7.5, [scale * 1.04, scale * 1.04]], [9, [scale, scale]], [10, [scale, scale], "linear"]] },
      wrap: { glow: { color: pal.warm, intensity: 0.55, spread: 14 } },
    };

    // soft radial halo behind center
    const halo = { shape: "circle", at: [cx, cy], radius: S * 0.36,
      fill: { type: "radial", cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: pal.warm }, { offset: 1, color: pal.cream }] },
      tracks: { opacity: [[0, 0.22], [1.5, 0.32], [4.5, 0.28], [7.5, 0.32], [10, 0.22]] } };

    return {
      duration: 10, size: [W, H],
      layers: [
        { shape: "rect", at: [cx, H * 0.5], width: W, height: H, fill: pal.cream },
        halo,
        ...orbit,
        centerShape,
        { shape: "text", at: [cx, S * 0.09], text: "shape · morph", fill: pal.warm, font: "system-ui, sans-serif", fontSize: S * 0.032, weight: 700, letterSpacing: S * 0.004, textAnchor: "middle", opacity: 0.9 },
        { shape: "text", at: [cx, H - S * 0.06], text: "path interpolation by nf-anim engine", fill: pal.muted, font: "Georgia, serif", fontSize: S * 0.028, weight: 400, letterSpacing: S * 0.001, textAnchor: "middle", opacity: 0.8, tracks: { opacity: [[0, 0.35], [1.2, 0.8, "outCubic"], [10, 0.8, "linear"]] } },
      ],
    };
  },
  describe(t) {
    const i = Math.min(5, Math.floor(t / 1.5));
    const names = ["circle", "heart", "star", "hexagon", "drop", "circle"];
    return { sceneId: meta.id, phase: t < 9 ? `morph:${names[i]}→${names[Math.min(5, i + 1)]}` : "settle", t, visible: true };
  },
  sample() { return meta.examples[0]; },
};
