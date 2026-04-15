// Animation applicator — resolves easing curves and applies animated property values
import { EASINGS, cubicBezier, springConfigurable, steps } from "../engine/keyframes.js";
import { EFFECT_FNS, EFFECT_IDS } from "./effects/index.js";
import { TRANSITION_FNS, TRANSITION_IDS } from "./transitions/index.js";
import { clamp01, serializeStyle } from "./shared.js";

const EASING_FACTORY_NAMES = new Set(["cubicBezier", "steps", "springConfigurable"]);

function parseFactorySpec(spec) {
  const trimmed = spec.trim();

  const bezierMatch = trimmed.match(/^cubicBezier\(([^)]+)\)$/);
  if (bezierMatch) {
    const values = bezierMatch[1].split(",").map((value) => Number.parseFloat(value.trim()));
    if (values.length === 4 && values.every(Number.isFinite)) {
      return cubicBezier(values[0], values[1], values[2], values[3]);
    }
  }

  const stepsMatch = trimmed.match(/^steps\(([^)]+)\)$/);
  if (stepsMatch) {
    const count = Number.parseInt(stepsMatch[1].trim(), 10);
    if (Number.isFinite(count)) {
      return steps(count);
    }
  }

  const springMatch = trimmed.match(/^springConfigurable\(([^)]+)\)$/);
  if (springMatch) {
    const values = springMatch[1].split(",").map((value) => Number.parseFloat(value.trim()));
    if (values.length >= 1 && values.every(Number.isFinite)) {
      const [damping, stiffness, mass] = values;
      return (t) => springConfigurable(t, { damping, stiffness, mass });
    }
  }

  return null;
}

function resolveEasing(spec) {
  if (typeof spec === "function") return spec;

  if (spec && typeof spec === "object") {
    const type = spec.type ?? spec.name;
    if (type === "cubicBezier") {
      return cubicBezier(spec.x1, spec.y1, spec.x2, spec.y2);
    }
    if (type === "steps") {
      return steps(spec.count ?? spec.n ?? spec.steps);
    }
    if (type === "springConfigurable") {
      return (t) => springConfigurable(t, spec);
    }
    if (typeof type === "string" && EASINGS[type] && !EASING_FACTORY_NAMES.has(type)) {
      return EASINGS[type];
    }
  }

  if (typeof spec === "string") {
    if (EASINGS[spec] && !EASING_FACTORY_NAMES.has(spec)) {
      return EASINGS[spec];
    }
    if (spec === "springConfigurable") {
      return (t) => springConfigurable(t);
    }
    return parseFactorySpec(spec) ?? EASINGS.linear;
  }

  return EASINGS.linear;
}

export const EASING_NAMES = Object.keys(EASINGS);
export const EFFECT_NAMES = [...EFFECT_IDS];
export const TRANSITION_NAMES = [...TRANSITION_IDS];

export function ease(easingName, t) {
  const fn = resolveEasing(easingName);
  return clamp01(fn(clamp01(t)));
}

export function getEffectCSS(effectName, progress, opts = {}) {
  const fn = EFFECT_FNS[effectName] || EFFECT_FNS.fadeIn;
  return serializeStyle(fn(clamp01(progress), opts));
}

export function getTransitionCSS(transitionName, progress, opts = {}) {
  const fn = TRANSITION_FNS[transitionName] || TRANSITION_FNS.dissolve;
  const styles = fn(clamp01(progress), opts);
  return {
    layerA: serializeStyle(styles.layerA),
    layerB: serializeStyle(styles.layerB),
  };
}

export const applyEasing = ease;
export const applyEffect = getEffectCSS;
export const applyTransition = getTransitionCSS;
