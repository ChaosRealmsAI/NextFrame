import type { Match, PlanCtx, Timeline, ValidationResult } from "../types.js";
import { buildStubPlan, type SegmentPlan } from "./_plan-heuristics.js";

export const name = "scene-per-segment";

export async function plan(ctx: PlanCtx): Promise<SegmentPlan[]> {
  return buildStubPlan(ctx);
}

// Reserved LLM integration point. Swap plan() to call this once the planner is wired.
export async function planWithLLM(_ctx: PlanCtx): Promise<SegmentPlan[]> {
  throw new Error("scene-per-segment LLM planner is not wired");
}

export function validate(_match: Match, _timeline: Timeline): ValidationResult {
  throw new Error("not implemented");
}

export function expand(_match: Match, _timeline: Timeline): Partial<Timeline> {
  throw new Error("not implemented");
}
