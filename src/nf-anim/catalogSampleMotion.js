import { BEHAVIORS } from "./behaviors/index.js";
import { defaultsOf, paramsOf, title } from "./catalogShared.js";
const VIEW = [320, 220];
const PALETTE = {
  ink: "#0f172a",
  accent: "#da7756",
  soft: "#fdba74",
  mist: "#e2e8f0",
  glow: "#fff7ed",
};

const behavior = (id, a = 0, d = 1, o = {}) =>
  BEHAVIORS[id]?.(a, d, o) || {
    tracks: {
      opacity: [
        [0, 1],
        [d, 1],
      ],
    },
  };
const pct = (track, div = 100) =>
  track?.map(([t, v, e]) => [t, typeof v === "number" ? v / div : v, e]);
function behaviorTracks(sample) {
  const tracks = { ...(sample.tracks || {}) };
  if (tracks.widthPercent && !tracks.scaleX) tracks.scaleX = pct(tracks.widthPercent);
  if (tracks.heightPercent && !tracks.scaleY) tracks.scaleY = pct(tracks.heightPercent);
  return { ...sample, tracks };
}
function motionLabel(text, y = 187) {
  return {
    shape: "text",
    at: [160, y],
    text,
    fontSize: 18,
    fill: PALETTE.ink,
    opacity: 0.88,
  };
}
function baseLayer(id, category, params) {
  if (id === "countUp") {
    return {
      shape: "text",
      at: [160, 108],
      text: String(params.value || 1247),
      fontSize: 72,
      fill: PALETTE.ink,
    };
  }
  if (/bar|chart|progress/i.test(id)) {
    return {
      shape: "bar",
      at: [160, 110],
      width: 82,
      height: 138,
      radius: 18,
      fill: PALETTE.accent,
      scale: [0.75, 0.92],
    };
  }
  if (/line|draw/i.test(id)) {
    return {
      shape: "line",
      at: [160, 110],
      points: [
        [-64, 34],
        [-26, -2],
        [8, 14],
        [58, -42],
      ],
      stroke: PALETTE.accent,
      strokeWidth: 10,
    };
  }
  if (/pie/i.test(id)) {
    return {
      shape: "pie",
      at: [160, 108],
      value: params.value || 72,
      radius: 58,
      fill: PALETTE.accent,
    };
  }
  return {
    shape: category === "continuous" ? "ring" : "circle",
    at: [160, 108],
    radius: 46,
    fill: PALETTE.accent,
    stroke: category === "continuous" ? PALETTE.soft : null,
    strokeWidth: 10,
  };
}
function sceneLayers(entry) {
  const id = entry.id;
  const text = title(id);
  const cat = entry.category;
  const textFx = [
    behavior("fadeIn", 0, 0.45),
    behavior("slideInUp", 0, 0.7, { distance: 22 }),
  ];
  if (cat === "feedback") {
    return [
      {
        type: id.includes("Like") ? "burst" : "ripple",
        at: [160, 102],
        count: 8,
        stroke: PALETTE.soft,
        fill: "none",
        duration: 0.9,
      },
      {
        shape: id.includes("Like")
          ? "heart"
          : id.includes("Check") || id.includes("success")
            ? "check"
            : "cross",
        at: [160, 102],
        fill: PALETTE.accent,
        stroke: id.includes("error") ? PALETTE.ink : null,
        strokeWidth: 6,
        behaviors: [behavior(id.includes("error") ? "shake" : "popIn", 0, 0.8)],
      },
      { ...motionLabel(text), behaviors: textFx },
    ];
  }
  if (cat === "data") {
    return [
      {
        shape: id.includes("pie") ? "pie" : id.includes("line") ? "line" : "bar",
        at: [104, 108],
        value: 68,
        radius: 42,
        width: 34,
        height: 96,
        fill: PALETTE.accent,
        points: [
          [-48, 28],
          [-16, -8],
          [18, 6],
          [54, -38],
        ],
        behaviors: [
          behavior(
            id.includes("line")
              ? "lineDraw"
              : id.includes("pie")
                ? "pieFill"
                : "barGrow",
            0,
            1.1,
          ),
        ],
      },
      {
        shape: "bar",
        at: [160, 108],
        width: 34,
        height: 132,
        radius: 12,
        fill: PALETTE.soft,
        behaviors: [behavior("barGrow", 0.1, 1)],
      },
      {
        shape: "bar",
        at: [216, 108],
        width: 34,
        height: 76,
        radius: 12,
        fill: PALETTE.mist,
        behaviors: [behavior("barGrow", 0.2, 1)],
      },
      { ...motionLabel(text), behaviors: textFx },
    ];
  }
  if (cat === "transition") {
    return [
      {
        shape: "rect",
        at: [160, 108],
        width: 236,
        height: 132,
        radius: 28,
        fill: PALETTE.accent,
        opacity: 0.18,
        behaviors: [behavior("fadeIn", 0, 0.3)],
      },
      {
        shape: "rect",
        at: [160, 108],
        width: 172,
        height: 98,
        radius: 22,
        fill: PALETTE.accent,
        behaviors: [
          behavior(
            id.includes("push")
              ? "slideInRight"
              : id.includes("iris")
                ? "scaleIn"
                : "wipeReveal",
            0,
            0.9,
          ),
        ],
      },
      { ...motionLabel(text), behaviors: textFx },
    ];
  }
  if (cat === "background") {
    return Array.from({ length: 8 }, (_, i) => ({
      shape: i % 3 ? "circle" : "dot",
      at: [56 + i * 30, 54 + (i % 2) * 52],
      radius: 10 + (i % 4) * 6,
      fill: i % 2 ? PALETTE.soft : PALETTE.accent,
      opacity: 0.18 + i * 0.06,
      behaviors: [behavior("float", i * 0.08, 1.6, { distance: 8 + i })],
    })).concat({ ...motionLabel(text), behaviors: textFx });
  }
  return [
    {
      shape: cat === "hero" ? "ring" : "rect",
      at: [160, 92],
      width: 188,
      height: 112,
      radius: 24,
      radiusX: 0,
      fill: cat === "hero" ? "none" : PALETTE.glow,
      stroke: PALETTE.soft,
      strokeWidth: 10,
      behaviors: [behavior(cat === "hero" ? "scaleIn" : "fadeIn", 0, 0.8)],
    },
    {
      shape: "text",
      at: [160, 92],
      text,
      fontSize: cat === "hero" ? 28 : 24,
      fill: PALETTE.ink,
      behaviors: textFx,
    },
    {
      ...motionLabel(title(cat || "scene")),
      fontSize: 14,
      fill: PALETTE.accent,
    },
  ];
}
function sampleMotion(kind, entry) {
  if (kind === "shape") {
    return {
      duration: 1.2,
      size: VIEW,
      layers: [
        {
          ...defaultsOf(paramsOf(entry)),
          shape: entry.name,
          at: [160, 108],
          opacity: 1,
        },
        motionLabel(title(entry.name)),
      ],
    };
  }
  if (kind === "scene") {
    const params = entry.sample?.() || {};
    const raw =
      entry.render?.(null, 0, params, { width: VIEW[0], height: VIEW[1] }) ||
      {};
    return raw.layers?.length
      ? { ...raw, size: raw.size || VIEW }
      : {
          duration: entry.duration_hint || 2,
          size: VIEW,
          layers: sceneLayers(entry),
        };
  }
  const params = defaultsOf(paramsOf(entry));
  const layer = baseLayer(entry.name, entry.category, params);
  return {
    duration: Math.max(1.4, entry.default_duration || 1),
    size: VIEW,
    layers: [
      {
        ...layer,
        behaviors: [
          behaviorTracks(
            behavior(
              entry.name,
              params.startAt || 0,
              params.duration || entry.default_duration || 1,
              params,
            ),
          ),
        ],
      },
      motionLabel(title(entry.name)),
    ],
  };
}
export { sampleMotion };
