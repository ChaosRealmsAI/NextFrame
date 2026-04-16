import slideInUp from "../../behaviors/entrance/slideInUp.js";
import popIn from "../../behaviors/entrance/popIn.js";
import fadeIn from "../../behaviors/entrance/fadeIn.js";

const FALLBACK = [
  { icon: "bolt", title: "极速启动", description: "干净流程零心智负担" },
  { icon: "sparkle", title: "动效讲故事", description: "节奏到位重点自现" },
  { icon: "leaf", title: "保持安静", description: "细节落地画面不吵" },
];
const norm = (items) => (Array.isArray(items) && items.length ? items : FALLBACK).map((item, i) => typeof item === "object" && item ? { icon: item.icon || FALLBACK[i % FALLBACK.length].icon, title: item.title || `Feature ${i + 1}`, description: item.description || "" } : { icon: FALLBACK[i % FALLBACK.length].icon, title: String(item || `Feature ${i + 1}`), description: "" });

const meta = {
  id: "featureRow",
  ratio: "any",
  duration_hint: 2.8,
  type: "motion",
  category: "reveal",
  description: "3 features in row with icon + title + description, stagger reveal (artisan rev)",
  params: [
    { name: "items", type: "array", default: FALLBACK },
    { name: "stagger", type: "number", default: 0.18 },
  ],
  examples: [{ items: FALLBACK, stagger: 0.18 }],
};

export default {
  ...meta,
  render(host, t, params = {}, vp = { width: 320, height: 240 }) {
    const items = norm(params.items).slice(0, 3);
    const stagger = Number.isFinite(params.stagger) ? params.stagger : 0.18;
    const W = vp.width || 320, H = vp.height || 240;
    const S = Math.min(W, H);
    const cy = H * 0.5;
    const palette = { ink: "#1a1614", warm: "#da7756", warmDeep: "#b8593e", cream: "#f5ece0", muted: "#7a6a5e", soft: "#fffbeb", card: "#fff5e8", iconBg: "#ffe4cc" };

    const span = W / (items.length + 1);
    const cardW = Math.min(W * 0.28, span * 0.85);
    const cardH = H * 0.62;

    const layers = [
      // ── soft cream wash background
      { shape: "rect", at: [W / 2, H / 2], width: W, height: H, fill: palette.soft,
        tracks: { opacity: [[0, 0], [0.3, 1, "out"]] } },
    ];

    items.forEach((item, i) => {
      const start = 0.25 + i * stagger;
      const x = span * (i + 1);
      // ── card background
      layers.push({ shape: "rect", at: [x, cy], width: cardW, height: cardH,
        radius: S * 0.020, fill: palette.card, opacity: 0.95,
        behaviors: [slideInUp(start, 0.6, { distance: S * 0.04 }), fadeIn(start, 0.45)] });

      // ── top warm-orange accent line on card
      layers.push({ shape: "rect", at: [x, cy - cardH * 0.46], width: cardW * 0.92, height: 2,
        fill: palette.warm, opacity: 0.9,
        behaviors: [fadeIn(start + 0.05, 0.4)] });

      // ── icon background circle (peach tint)
      layers.push({ shape: "circle", at: [x, cy - cardH * 0.20], radius: S * 0.058, fill: palette.iconBg,
        behaviors: [popIn(start + 0.10, 0.45, { fromScale: 0.4, peakScale: 1.10 })] });

      // ── the icon (warm deep color)
      layers.push({ shape: item.icon, at: [x, cy - cardH * 0.20], scale: S / 1800,
        fill: palette.warmDeep,
        behaviors: [popIn(start + 0.18, 0.4, { fromScale: 0, peakScale: 1.2 })] });

      // ── title text (ink, sans bold)
      layers.push({ shape: "text", at: [x, cy + cardH * 0.05], text: item.title,
        fill: palette.ink, font: "system-ui, sans-serif", fontSize: S * 0.040, weight: 700,
        behaviors: [slideInUp(start + 0.22, 0.5, { distance: S * 0.018 })] });

      // ── description text (muted, smaller)
      if (item.description) {
        layers.push({ shape: "text", at: [x, cy + cardH * 0.18], text: item.description,
          fill: palette.muted, font: "system-ui, sans-serif", fontSize: S * 0.026, weight: 500,
          behaviors: [slideInUp(start + 0.30, 0.5, { distance: S * 0.014 })] });
      }
    });

    return { duration: meta.duration_hint, size: [W, H], layers };
  },
  describe(t, params = {}, vp = {}) {
    const items = norm(params.items);
    return { sceneId: meta.id, t, itemCount: items.length, vp };
  },
  sample() { return { items: FALLBACK, stagger: 0.18 }; },
};
