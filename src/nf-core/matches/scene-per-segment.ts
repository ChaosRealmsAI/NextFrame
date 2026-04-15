// Skeleton match rule for scene-per-segment planning and expansion.
import type { Match, PlanCtx, Timeline, ValidationResult } from "../types.js";

export const name = "scene-per-segment";

export async function plan(_ctx: PlanCtx): Promise<unknown> {
  throw new Error("not implemented");
}

export function validate(_match: Match, _timeline: Timeline): ValidationResult {
  throw new Error("not implemented");
}

export function expand(_match: Match, _timeline: Timeline): Partial<Timeline> {
  throw new Error("not implemented");
}
