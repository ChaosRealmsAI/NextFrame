// Scene metadata — every scene must declare ratio (ADR-006).
// ratio: "16:9" | "9:16" | "4:3" | null (null = universal)
const p = (name, type, fallback, extra = {}) => ({ name, type, default: fallback, ...extra });

export const META_TABLE = {
  auroraGradient:   { ratio: null, category: "Backgrounds", description: "Drifting hue gradient with film grain", duration_hint: 12, params: [p("hueA", "number", 270, { range: [0, 360], semantic: "primary hue" }), p("hueB", "number", 200, { range: [0, 360], semantic: "secondary hue" }), p("hueC", "number", 320, { range: [0, 360], semantic: "tertiary hue" }), p("intensity", "number", 1, { range: [0, 1.5], semantic: "color intensity" }), p("grain", "number", 0.04, { range: [0, 0.15], semantic: "film grain" })] },
  kineticHeadline:  { ratio: null, category: "Typography", description: "Big animated headline + subtitle reveal", duration_hint: 5, params: [p("text", "string", "NEXTFRAME", { required: true, semantic: "headline text" }), p("subtitle", "string", "Frame-pure scene library", { semantic: "subtitle" }), p("hueStart", "number", 30, { range: [0, 360], semantic: "start hue" }), p("hueEnd", "number", 320, { range: [0, 360], semantic: "end hue" }), p("stagger", "number", 0.18, { range: [0.05, 0.5], semantic: "letter stagger" }), p("size", "number", 0.12, { range: [0.05, 0.25], semantic: "font size ratio" })] },
  barChartReveal:   { ratio: null, category: "Data", description: "Bar chart bars rising into place", duration_hint: 5, params: [p("title", "string", "MONTHLY GROWTH", { semantic: "chart title" }), p("unit", "string", "%", { semantic: "value unit" }), p("hueStart", "number", 200, { range: [0, 360], semantic: "start hue" }), p("hueEnd", "number", 320, { range: [0, 360], semantic: "end hue" }), p("stagger", "number", 0.12, { range: [0.05, 0.5], semantic: "bar stagger" }), p("barDur", "number", 0.85, { range: [0.2, 2], semantic: "bar grow dur" })] },
  circleRipple:     { ratio: null, category: "Shapes", description: "Expanding concentric ring ripple", duration_hint: 6, params: [p("hueStart", "number", 185, { range: [0, 360], semantic: "start hue" }), p("hueSpan", "number", 180, { range: [30, 300], semantic: "hue span" }), p("ringCount", "number", 9, { range: [4, 16], semantic: "ring count" }), p("interval", "number", 0.26, { range: [0.08, 1], semantic: "spawn interval s" }), p("lifespan", "number", 2.1, { range: [0.5, 6], semantic: "ring lifespan s" }), p("thickness", "number", 0.012, { range: [0.004, 0.03], semantic: "ring thickness" })] },
  lowerThirdVelvet: { ratio: null, category: "Overlays", description: "Lower third title bar with wipe and pulse dot", duration_hint: 6, params: [p("title", "string", "NEXTFRAME", { required: true, semantic: "title text" }), p("subtitle", "string", "Scene Registry Demo", { semantic: "subtitle" }), p("hueA", "number", 20, { range: [0, 360], semantic: "primary hue" }), p("hueB", "number", 320, { range: [0, 360], semantic: "secondary hue" }), p("holdEnd", "number", 4, { range: [0.5, 20], semantic: "hold end s" }), p("fadeOut", "number", 0.6, { range: [0.1, 4], semantic: "fade out s" })] },
};

export function getSceneMeta(id) {
  const meta = META_TABLE[id];
  return meta ? { id, ...meta } : null;
}

export function listSceneMeta() {
  return Object.keys(META_TABLE).map((id) => getSceneMeta(id));
}

export function listScenesForRatio(ratioId) {
  return Object.keys(META_TABLE)
    .map((id) => getSceneMeta(id))
    .filter((s) => s.ratio === null || s.ratio === ratioId);
}
