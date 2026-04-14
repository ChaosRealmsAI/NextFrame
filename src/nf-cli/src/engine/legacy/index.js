// L2 engine — re-exports.
export { resolveTimeline, resolveExpression, GRID_SIZE } from "./time.js";
export { validateTimelineLegacy as validateTimeline } from "../../core/timeline-validate.js";
export { renderAt } from "../../core/legacy-render.js";
export { describeFrame } from "./describe.js";
