// Dispatches registered v0.6 match rules.
import type { Match, MatchRule, PlanCtx, Timeline, ValidationResult } from "../types.js";

import * as scenePerSegment from "./scene-per-segment.js";
import * as subtitleFromWords from "./subtitle-from-words.js";
import * as ducking from "./ducking.js";

export const registry: Record<string, MatchRule> = {
  [scenePerSegment.name]: {
    name: scenePerSegment.name,
    plan: scenePerSegment.plan,
    validate: scenePerSegment.validate,
    expand: scenePerSegment.expand,
  },
  [subtitleFromWords.name]: {
    name: subtitleFromWords.name,
    plan: subtitleFromWords.plan,
    validate: subtitleFromWords.validate,
    expand: subtitleFromWords.expand,
  },
  [ducking.name]: {
    name: ducking.name,
    plan: ducking.plan,
    validate: ducking.validate,
    expand: ducking.expand,
  },
};

function getRule(ruleName: string): MatchRule {
  const rule = registry[ruleName];
  if (!rule) {
    throw new Error(`unknown match rule: ${ruleName}`);
  }
  return rule;
}

export async function dispatchPlan(ruleName: string, ctx: PlanCtx): Promise<unknown> {
  return getRule(ruleName).plan(ctx);
}

export function dispatchValidate(match: Match, timeline: Timeline): ValidationResult {
  return getRule(match.rule).validate(match, timeline);
}

export function dispatchExpand(match: Match, timeline: Timeline): Partial<Timeline> {
  return getRule(match.rule).expand(match, timeline);
}
