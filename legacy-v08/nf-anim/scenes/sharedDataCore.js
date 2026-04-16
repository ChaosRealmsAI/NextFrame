import countUp from "../behaviors/data/countUp.js";
import barGrow from "../behaviors/data/barGrow.js";
import lineDraw from "../behaviors/data/lineDraw.js";
import nodeReveal from "../behaviors/data/nodeReveal.js";
import mapPin from "../behaviors/data/mapPin.js";
import pieFill from "../behaviors/data/pieFill.js";
import chartReveal from "../behaviors/data/chartReveal.js";
import fadeIn from "../behaviors/entrance/fadeIn.js";
import slideInUp from "../behaviors/entrance/slideInUp.js";
import popIn from "../behaviors/entrance/popIn.js";

const FONT = "Avenir Next, Helvetica Neue, sans-serif";

const WARM = {
  bg: "#1b1512",
  panel: "#2a201b",
  card: "#342822",
  line: "#5c4a3f",
  text: "#f5ece1",
  muted: "#d2b9a2",
  accent: "#da7756",
  gold: "#f0b172",
  clay: "#8f5f48",
  sand: "#f7d6a2",
};

const LANDS = [
  [[-420, -70], [-320, -120], [-250, -80], [-220, -10], [-260, 50], [-360, 40], [-420, -10]],
  [[-250, 70], [-180, 140], [-210, 250], [-260, 200], [-280, 120]],
  [[0, -120], [80, -150], [140, -90], [110, -20], [30, -10], [-10, -60]],
  [[0, 20], [80, 10], [120, 90], [70, 190], [0, 170], [-30, 90]],
  [[150, -100], [310, -130], [440, -70], [400, 20], [260, 40], [170, 10]],
  [[340, 150], [430, 170], [460, 230], [390, 270], [320, 220]],
];

const PIN_MAP = {
  na: [0.24, 0.33],
  sa: [0.31, 0.69],
  eu: [0.49, 0.27],
  africa: [0.5, 0.53],
  asia: [0.69, 0.38],
  oceania: [0.82, 0.72],
  us: [0.22, 0.33],
  uk: [0.46, 0.24],
  india: [0.64, 0.47],
  japan: [0.78, 0.34],
  singapore: [0.7, 0.58],
};

const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const clone = (v) => JSON.parse(JSON.stringify(v));

const vpOf = (vp = {}) => {
  const width = Math.max(360, n(vp.width, 1280));
  const height = Math.max(240, n(vp.height, 720));

  return [width, height, Math.min(width, height)];
};

const txt = (x, y, text, fontSize, fill = WARM.text, extra = {}) => ({
  shape: "text",
  at: [x, y],
  text: String(text),
  fontSize,
  fill,
  font: FONT,
  ...extra,
});

const box = (x, y, width, height, fill = WARM.panel, extra = {}) => ({
  shape: "rect",
  at: [x, y],
  width,
  height,
  radius: Math.min(width, height) * 0.1,
  fill,
  ...extra,
});

const base = (W, H) => [
  { shape: "rect", at: [W / 2, H / 2], width: W, height: H, fill: WARM.bg },
  {
    shape: "rect",
    at: [W / 2, H * 0.1],
    width: W * 0.82,
    height: Math.max(2, H * 0.004),
    fill: WARM.line,
    opacity: 0.35,
  },
];

const dataOf = (data, fallback) => {
  if (Array.isArray(data) && data.length) return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.items) && data.items.length) return data.items;
    return [data];
  }
  return fallback;
};

const itemOf = (item, i, fallback = 0) => {
  if (typeof item === "number") {
    return { label: `Metric ${i + 1}`, value: item, suffix: "" };
  }

  return {
    label: item?.label || item?.name || item?.title || `Metric ${i + 1}`,
    value: n(item?.value ?? item?.amount ?? item?.percent ?? item?.score, fallback),
    suffix: item?.suffix || item?.unit || "",
  };
};

const chartOf = (data, fallback) =>
  dataOf(data, fallback).map((item, i) => itemOf(item, i, fallback[i]?.value || 0));

const compareOf = (data, fallback) =>
  dataOf(data, fallback).map((item, i) => {
    if (typeof item === "number") {
      return { label: `Metric ${i + 1}`, left: item, right: item * 0.8 };
    }

    return {
      label: item?.label || `Metric ${i + 1}`,
      left: n(item?.left ?? item?.a ?? item?.before ?? item?.value, 0),
      right: n(item?.right ?? item?.b ?? item?.after ?? item?.target, 0),
    };
  });

const pinDefaults = [
  [0.24, 0.33],
  [0.48, 0.28],
  [0.68, 0.42],
  [0.82, 0.7],
];

const pinOf = (item, i) => {
  const key = String(item?.region || item?.code || item?.label || "")
    .toLowerCase()
    .replace(/\s+/g, "");

  const xy =
    Number.isFinite(Number(item?.x)) && Number.isFinite(Number(item?.y))
      ? [n(item.x), n(item.y)]
      : PIN_MAP[key] || pinDefaults[i % 4];

  return {
    label: item?.label || item?.name || `Point ${i + 1}`,
    value: n(item?.value ?? item?.amount ?? 50, 50),
    x: clamp(xy[0], 0.08, 0.92),
    y: clamp(xy[1], 0.12, 0.88),
  };
};

const withScene = (metaIn, sample, build) => ({
  ...metaIn,
  render(host, t, params = {}, vp = {}) {
    void host;

    return build(
      t,
      { ...params, data: params.data ?? clone(sample.data) },
      vp,
    );
  },
  describe(t, params = {}, vp = {}) {
    return {
      sceneId: metaIn.id,
      t,
      params,
      vp,
      summary: metaIn.description,
    };
  },
  sample() {
    return clone(sample);
  },
});

export {
  barGrow,
  base,
  box,
  chartOf,
  chartReveal,
  clamp,
  compareOf,
  countUp,
  dataOf,
  fadeIn,
  itemOf,
  lineDraw,
  LANDS,
  mapPin,
  nodeReveal,
  pieFill,
  pinOf,
  popIn,
  slideInUp,
  txt,
  vpOf,
  WARM,
  withScene,
};
