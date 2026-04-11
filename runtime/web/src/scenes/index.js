import { auroraGradient } from "./auroraGradient.js";
import { circleRipple } from "./circleRipple.js";
import { cornerBadge } from "./cornerBadge.js";
import { countdown } from "./countdown.js";
import { dataPulse } from "./dataPulse.js";
import { fluidBackground } from "./fluidBackground.js";
import { glitchText } from "./glitchText.js";
import { imageHero } from "./imageHero.js";
import { kineticHeadline } from "./kineticHeadline.js";
import { lineChart } from "./lineChart.js";
import { meshGrid } from "./meshGrid.js";
import { neonGrid } from "./neonGrid.js";
import { barChartReveal } from "./barChartReveal.js";
import { lowerThirdVelvet } from "./lowerThirdVelvet.js";
import { orbitRings } from "./orbitRings.js";
import { pixelRain } from "./pixelRain.js";
import { shapeBurst } from "./shapeBurst.js";
import { spotlightSweep } from "./spotlightSweep.js";
import { starfield } from "./starfield.js";
import { textOverlay } from "./textOverlay.js";

function cloneDefaultValue(value) {
  if (value == null || typeof value !== "object") {
    return value;
  }

  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function createDefaultParams(params) {
  if (!params || typeof params !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(params).map(([name, config]) => [name, cloneDefaultValue(config?.default)]),
  );
}

const SCENE_REGISTRY = [
  {
    id: "auroraGradient",
    fn: auroraGradient,
    name: "Aurora Gradient",
    category: "Backgrounds",
    duration_hint: "10-30s",
    params: {
      hueA: { type: "number", default: 270, min: 0, max: 360, ui: "hue" },
      hueB: { type: "number", default: 200, min: 0, max: 360, ui: "hue" },
      hueC: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
      intensity: { type: "number", default: 1, min: 0, max: 1.5 },
      grain: { type: "number", default: 0.04, min: 0, max: 0.15 },
    },
  },
  {
    id: "fluidBackground",
    fn: fluidBackground,
    name: "Fluid Background",
    category: "Backgrounds",
    duration_hint: "5-30s",
    params: {
      blobCount: { type: "integer", default: 5, min: 1, max: 8 },
      hueA: { type: "number", default: 210, min: 0, max: 360, ui: "hue" },
      hueB: { type: "number", default: 290, min: 0, max: 360, ui: "hue" },
      hueC: { type: "number", default: 340, min: 0, max: 360, ui: "hue" },
      intensity: { type: "number", default: 0.6, min: 0, max: 1.5 },
      drift: { type: "number", default: 0.4, min: 0, max: 1 },
      blur: { type: "number", default: 80, min: 0, max: 160, unit: "px" },
    },
  },
  {
    id: "imageHero",
    fn: imageHero,
    name: "Image Hero",
    category: "Media",
    duration_hint: "5-15s",
    params: {
      src: { type: "text", default: null },
      fit: { type: "select", default: "cover", options: ["cover", "contain"] },
      zoomStart: { type: "number", default: 1, min: 0.5, max: 2.5 },
      zoomEnd: { type: "number", default: 1.15, min: 0.5, max: 3 },
      panX: { type: "number", default: 0.05, min: -0.5, max: 0.5 },
      panY: { type: "number", default: -0.03, min: -0.5, max: 0.5 },
      holdEdges: {
        type: "select",
        default: true,
        options: [
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
    },
  },
  {
    id: "kineticHeadline",
    fn: kineticHeadline,
    name: "Kinetic Headline",
    category: "Typography",
    duration_hint: "3-6s",
    params: {
      text: { type: "string", default: "NEXTFRAME" },
      subtitle: { type: "string", default: "Frame-pure scene library" },
      hueStart: { type: "number", default: 30, min: 0, max: 360, ui: "hue" },
      hueEnd: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
      stagger: { type: "number", default: 0.18, min: 0.05, max: 0.5, unit: "s" },
      size: { type: "number", default: 0.12, min: 0.05, max: 0.25 },
    },
  },
  {
    id: "glitchText",
    fn: glitchText,
    name: "Glitch Text",
    category: "Typography",
    duration_hint: "2-12s loop",
    params: {
      text: { type: "string", default: "GLITCH" },
      fontSize: { type: "number", default: 140, min: 24, max: 320 },
      weight: {
        type: "select",
        default: "900",
        options: ["300", "400", "500", "600", "700", "800", "900"],
      },
      baseHue: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
      glitchAmount: { type: "number", default: 0.4, min: 0, max: 1.5 },
      scanlines: {
        type: "select",
        default: true,
        options: [
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
      burstFreq: { type: "number", default: 2.5, min: 0.1, max: 12 },
    },
  },
  {
    id: "neonGrid",
    fn: neonGrid,
    name: "Neon Grid",
    category: "Shapes & Layout",
    duration_hint: "5-30s",
    params: {
      hueHorizon: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
      hueGrid: { type: "number", default: 280, min: 0, max: 360, ui: "hue" },
      scrollSpeed: { type: "number", default: 0.4, min: 0, max: 2 },
      lineCount: { type: "integer", default: 16, min: 8, max: 32 },
      colCount: { type: "integer", default: 22, min: 8, max: 48 },
    },
  },
  {
    id: "meshGrid",
    fn: meshGrid,
    name: "Mesh Grid",
    category: "Shapes & Layout",
    duration_hint: "5-30s",
    params: {
      cols: { type: "integer", default: 20, min: 6, max: 40 },
      rows: { type: "integer", default: 14, min: 4, max: 28 },
      hueA: { type: "number", default: 200, min: 0, max: 360, ui: "hue" },
      hueB: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
      waveSpeed: { type: "number", default: 0.7, min: 0, max: 3 },
      waveAmp: { type: "number", default: 0.18, min: 0, max: 0.4 },
      perspective: { type: "number", default: 0.45, min: 0, max: 1 },
      lineWidth: { type: "number", default: 1.4, min: 0.5, max: 4, unit: "px" },
    },
  },
  {
    id: "starfield",
    fn: starfield,
    name: "Starfield",
    category: "Backgrounds",
    duration_hint: "5-30s",
    params: {
      hueBase: { type: "number", default: 215, min: 0, max: 360, ui: "hue" },
      hueShift: { type: "number", default: 110, min: 0, max: 180 },
      drift: { type: "number", default: 0.06, min: 0, max: 0.2 },
      density: { type: "number", default: 1, min: 0.4, max: 2 },
      glow: { type: "number", default: 1, min: 0.4, max: 2 },
    },
  },
  {
    id: "spotlightSweep",
    fn: spotlightSweep,
    name: "Spotlight Sweep",
    category: "Backgrounds",
    duration_hint: "5-30s loop",
    params: {
      beamCount: { type: "integer", default: 3, min: 1, max: 8 },
      hueA: { type: "number", default: 210, min: 0, max: 360, ui: "hue" },
      hueB: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
      sweepSpeed: { type: "number", default: 0.5, min: 0, max: 3 },
      beamWidth: { type: "number", default: 0.4, min: 0.05, max: 1.2 },
      intensity: { type: "number", default: 0.85, min: 0, max: 1.5 },
      ambient: { type: "number", default: 0.05, min: 0, max: 0.3 },
    },
  },
  {
    id: "pixelRain",
    fn: pixelRain,
    name: "Pixel Rain",
    category: "Backgrounds",
    duration_hint: "5-30s loop",
    params: {
      columns: { type: "integer", default: 48, min: 4, max: 160 },
      hueStart: { type: "number", default: 140, min: 0, max: 360, ui: "hue" },
      hueEnd: { type: "number", default: 200, min: 0, max: 360, ui: "hue" },
      speed: { type: "number", default: 180, min: 20, max: 960 },
      density: { type: "number", default: 1.2, min: 0, max: 4 },
      charSize: { type: "number", default: 18, min: 8, max: 72, unit: "px" },
      glyphPalette: { type: "string", default: "01ABCDEF" },
    },
  },
  {
    id: "circleRipple",
    fn: circleRipple,
    name: "Circle Ripple",
    category: "Shapes & Layout",
    duration_hint: "3-12s",
    params: {
      hueStart: { type: "number", default: 185, min: 0, max: 360, ui: "hue" },
      hueSpan: { type: "number", default: 180, min: 30, max: 300 },
      ringCount: { type: "integer", default: 9, min: 4, max: 16 },
      interval: { type: "number", default: 0.26, min: 0.08, max: 1, unit: "s" },
      lifespan: { type: "number", default: 2.1, min: 0.5, max: 6, unit: "s" },
      thickness: { type: "number", default: 0.012, min: 0.004, max: 0.03 },
    },
  },
  {
    id: "orbitRings",
    fn: orbitRings,
    name: "Orbit Rings",
    category: "Backgrounds",
    duration_hint: "5-30s loop",
    params: {
      ringCount: { type: "integer", default: 6, min: 1, max: 10 },
      hueA: { type: "number", default: 180, min: 0, max: 360, ui: "hue" },
      hueB: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
      baseSpeed: { type: "number", default: 0.4, min: 0.05, max: 2 },
      dotSize: { type: "number", default: 10, min: 2, max: 48, unit: "px" },
      ringWidth: { type: "number", default: 1.5, min: 0.5, max: 6, unit: "px" },
      glow: {
        type: "select",
        default: true,
        options: [
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
    },
  },
  {
    id: "countdown",
    fn: countdown,
    name: "Countdown",
    category: "Typography",
    duration_hint: "6s loop",
    params: {
      sequence: { type: "array", default: ["5", "4", "3", "2", "1", "GO"] },
      subtitle: { type: "string", default: "SYSTEMS ARMED" },
      hueStart: { type: "number", default: 18, min: 0, max: 360, ui: "hue" },
      hueEnd: { type: "number", default: 145, min: 0, max: 360, ui: "hue" },
      accentHue: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
    },
  },
  {
    id: "shapeBurst",
    fn: shapeBurst,
    name: "Shape Burst",
    category: "Shapes & Layout",
    duration_hint: "2-8s",
    params: {
      count: { type: "integer", default: 80, min: 8, max: 240 },
      shape: {
        type: "select",
        default: "mixed",
        options: ["circle", "triangle", "square", "mixed"],
      },
      hueStart: { type: "number", default: 200, min: 0, max: 360, ui: "hue" },
      hueEnd: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
      sizeMin: { type: "number", default: 12, min: 2, max: 96 },
      sizeMax: { type: "number", default: 48, min: 4, max: 160 },
      speed: { type: "number", default: 320, min: 40, max: 960 },
      gravity: { type: "number", default: 120, min: -240, max: 720 },
      fadeOut: {
        type: "select",
        default: true,
        options: [
          { value: "true", label: "true" },
          { value: "false", label: "false" },
        ],
      },
    },
  },
  {
    id: "barChartReveal",
    fn: barChartReveal,
    name: "Bar Chart Reveal",
    category: "Data Viz",
    duration_hint: "3-6s",
    params: {
      data: {
        type: "array",
        default: [
          { label: "JAN", value: 42 },
          { label: "FEB", value: 68 },
          { label: "MAR", value: 55 },
          { label: "APR", value: 81 },
          { label: "MAY", value: 73 },
          { label: "JUN", value: 96 },
          { label: "JUL", value: 88 },
        ],
      },
      title: { type: "string", default: "MONTHLY GROWTH" },
      unit: { type: "string", default: "%" },
      hueStart: { type: "number", default: 200, min: 0, max: 360, ui: "hue" },
      hueEnd: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
      stagger: { type: "number", default: 0.12, min: 0.05, max: 0.5, unit: "s" },
      barDur: { type: "number", default: 0.85, min: 0.2, max: 2, unit: "s" },
    },
  },
  {
    id: "lineChart",
    fn: lineChart,
    name: "Line Chart",
    category: "Data Viz",
    duration_hint: "3-8s",
    params: {
      data: { type: "array", default: [18, 24, 31, 38, 43, 55, 66, 78] },
      title: { type: "string", default: "ACTIVE USERS" },
      unit: { type: "string", default: "%" },
      hueStart: { type: "number", default: 182, min: 0, max: 360, ui: "hue" },
      hueEnd: { type: "number", default: 310, min: 0, max: 360, ui: "hue" },
      drawStart: { type: "number", default: 0.2, min: 0, max: 2, unit: "s" },
      drawEnd: { type: "number", default: 2.6, min: 0.4, max: 6, unit: "s" },
    },
  },
  {
    id: "dataPulse",
    fn: dataPulse,
    name: "Data Pulse",
    category: "Data Viz",
    duration_hint: "5-30s loop",
    params: {
      bars: { type: "integer", default: 64, min: 8, max: 160 },
      hueA: { type: "number", default: 180, min: 0, max: 360, ui: "hue" },
      hueB: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
      peak: { type: "number", default: 0.8, min: 0, max: 1.5 },
      baseHeight: { type: "number", default: 0.15, min: 0, max: 0.6 },
      smoothness: { type: "number", default: 0.25, min: 0, max: 1 },
      glowAlpha: { type: "number", default: 0.4, min: 0, max: 1 },
    },
  },
  {
    id: "lowerThirdVelvet",
    fn: lowerThirdVelvet,
    name: "Lower Third Velvet",
    category: "Overlays",
    duration_hint: "4-8s",
    params: {
      title: { type: "string", default: "NEXTFRAME" },
      subtitle: { type: "string", default: "Scene Registry Demo" },
      hueA: { type: "number", default: 20, min: 0, max: 360, ui: "hue" },
      hueB: { type: "number", default: 320, min: 0, max: 360, ui: "hue" },
      holdEnd: { type: "number", default: 4, min: 0.5, max: 20, unit: "s" },
      fadeOut: { type: "number", default: 0.6, min: 0.1, max: 4, unit: "s" },
    },
  },
  {
    id: "cornerBadge",
    fn: cornerBadge,
    name: "Corner Badge",
    category: "Overlays",
    duration_hint: "2-12s",
    params: {
      label: { type: "string", default: "BREAKING" },
      subtitle: { type: "string", default: "SCENE LIBRARY EXPANDS TO TEN" },
      hue: { type: "number", default: 346, min: 0, max: 360, ui: "hue" },
      accentHue: { type: "number", default: 32, min: 0, max: 360, ui: "hue" },
      inset: { type: "number", default: 0.045, min: 0.01, max: 0.12 },
    },
  },
  {
    id: "textOverlay",
    fn: textOverlay,
    name: "Text Overlay",
    category: "Overlays",
    duration_hint: "3-8s",
    params: {
      text: { type: "text", default: "Your text here" },
      fontSize: { type: "number", default: 96, min: 16, max: 240 },
      color: { type: "color", default: "#ffffff" },
      align: { type: "select", default: "center", options: ["left", "center", "right"] },
      anchor: {
        type: "select",
        default: "center",
        options: [
          "top-left",
          "top-center",
          "top-right",
          "center",
          "bottom-left",
          "bottom-center",
          "bottom-right",
        ],
      },
      weight: {
        type: "select",
        default: "800",
        options: ["300", "400", "500", "600", "700", "800", "900"],
      },
      letterSpacing: { type: "number", default: -0.02, min: -0.2, max: 0.3 },
      enterDur: { type: "number", default: 0.6, min: 0.1, max: 3, unit: "s" },
      holdDur: { type: "number", default: 2.5, min: 0, max: 12, unit: "s" },
    },
  },
];

export const SCENE_MANIFEST = SCENE_REGISTRY.map(({ id, name, category, params, duration_hint }) => ({
  id,
  name,
  category,
  params,
  default_params: createDefaultParams(params),
  duration_hint,
}));

export const SCENE_MANIFEST_BY_ID = new Map(SCENE_MANIFEST.map((scene) => [scene.id, scene]));

/**
 * Register every built-in scene on the provided engine.
 * @param {{registerScene: (id: string, fn: Function) => unknown}} engine - Engine module or adapter exposing registerScene.
 * @returns {void}
 */
export function registerAllScenes(engine) {
  if (!engine || typeof engine.registerScene !== "function") {
    throw new TypeError("registerAllScenes(engine) requires engine.registerScene");
  }

  for (const scene of SCENE_REGISTRY) {
    engine.registerScene(scene.id, scene.fn);
  }
}
