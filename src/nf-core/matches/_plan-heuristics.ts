import { execFileSync } from "node:child_process";
import type { AudioTrack, PlanCtx, SceneEntry, SceneParam, Segment } from "../types.js";
import { listScenesForRatio } from "../scenes/index.js";
import {
  buildFallbackParams,
  buildParamsForScene,
  hasCodeishText,
  hasNumber,
  pickFallbackScene,
  rankScenesForSegment,
} from "./_plan-scoring.js";

export interface SegmentPlan {
  segmentId: string;
  scene: string | "@prev";
  params?: Record<string, unknown>;
  emphasis?: string[];
}

export interface SceneParamDef {
  name: string;
  type?: string;
  required?: boolean;
  hasDefault: boolean;
  defaultValue?: unknown;
}

export interface SceneSpec {
  id: string;
  ratio?: string;
  description?: string;
  params: SceneParamDef[];
  contractAllowedParams?: string[];
  contractDefaultedParams?: string[];
}

const SCENE_SPEC_CACHE = new Map<string, SceneSpec[]>();
const SCENE_INDEX_URL = new URL("../scenes/index.js", import.meta.url).href;

export function getAudioTrackFromPlanCtx(ctx: PlanCtx): AudioTrack | null {
  if (ctx.source?.kind === "audio") {
    return ctx.source;
  }
  const track = (ctx.timeline?.tracks || []).find((entry) => entry?.id === ctx.match?.source);
  return track?.kind === "audio" ? track : null;
}

export function getSegmentsFromPlanCtx(ctx: PlanCtx): Segment[] {
  const source = getAudioTrackFromPlanCtx(ctx);
  return Array.isArray(source?.meta?.segments) ? source.meta.segments : [];
}

export function getRatioFromPlanCtx(ctx: PlanCtx): string {
  if (typeof ctx.ratio === "string" && ctx.ratio) {
    return ctx.ratio;
  }
  if (typeof ctx.timeline?.ratio === "string" && ctx.timeline.ratio) {
    return ctx.timeline.ratio;
  }
  return "16:9";
}

export function normalizeSceneSpec(entry: unknown): SceneSpec | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const candidate = entry as SceneEntry & { ratio?: string; description?: string; params?: unknown };
  const id = typeof candidate.id === "string" ? candidate.id : typeof candidate.META?.id === "string" ? candidate.META.id : "";
  if (!id) {
    return null;
  }

  return {
    id,
    ratio:
      typeof candidate.ratio === "string"
        ? candidate.ratio
        : typeof candidate.META?.ratio === "string"
          ? candidate.META.ratio
          : undefined,
    description:
      typeof candidate.description === "string"
        ? candidate.description
        : typeof candidate.META?.description === "string"
          ? candidate.META.description
          : undefined,
    params: normalizeParamDefs(candidate.params ?? candidate.META?.params),
    contractAllowedParams: normalizeStringArray((candidate as { contractAllowedParams?: unknown }).contractAllowedParams),
    contractDefaultedParams: normalizeStringArray((candidate as { contractDefaultedParams?: unknown }).contractDefaultedParams),
  };
}

export async function loadSceneSpecsForPlan(ctx: PlanCtx): Promise<SceneSpec[]> {
  const ratio = getRatioFromPlanCtx(ctx);
  if (Object.prototype.hasOwnProperty.call(ctx, "sceneRegistry")) {
    const fromCtx = Array.isArray(ctx.sceneRegistry) ? ctx.sceneRegistry : [];
    const normalizedFromCtx = fromCtx.map(normalizeSceneSpec).filter((entry): entry is SceneSpec => entry !== null);
    return normalizedFromCtx.filter((entry) => !entry.ratio || entry.ratio === ratio);
  }
  const discovered = await listScenesForRatio(ratio);
  return discovered.map(normalizeSceneSpec).filter((entry): entry is SceneSpec => entry !== null);
}

export function loadSceneSpecsForValidation(ratio: string): SceneSpec[] {
  if (SCENE_SPEC_CACHE.has(ratio)) {
    return SCENE_SPEC_CACHE.get(ratio) || [];
  }

  const script = `
    import { getRegistry } from ${JSON.stringify(SCENE_INDEX_URL)};

    function normalizeParamDefs(raw) {
      if (Array.isArray(raw)) {
        return raw
          .filter((entry) => entry && typeof entry === "object" && typeof entry.name === "string")
          .map((entry) => ({
            name: entry.name,
            type: entry.type,
            required: entry.required === true,
            hasDefault: Object.prototype.hasOwnProperty.call(entry, "default"),
            defaultValue: entry.default,
          }));
      }
      if (!raw || typeof raw !== "object") {
        return [];
      }
      return Object.entries(raw).map(([name, value]) => ({
        name,
        type: value?.type,
        required: value?.required === true,
        hasDefault: Boolean(value && Object.prototype.hasOwnProperty.call(value, "default")),
        defaultValue: value?.default,
      }));
    }

    function normalizeParamValue(param) {
      if (param.hasDefault) {
        return param.defaultValue;
      }
      switch (param.type) {
        case "number":
          return 1;
        case "boolean":
          return true;
        case "array":
          return [];
        default:
          return "__scene_contract_probe__";
      }
    }

    function readDescribeParams(meta, params) {
      if (typeof meta?.describe !== "function") {
        return null;
      }
      try {
        const described = meta.describe(0, params, { width: 1920, height: 1080 });
        const describedParams = described?.params;
        if (!describedParams || typeof describedParams !== "object" || Array.isArray(describedParams)) {
          return null;
        }
        return describedParams;
      } catch {
        return null;
      }
    }

    const registry = await getRegistry();
    const scenes = [...registry.values()]
      .filter((entry) => entry?.META?.ratio === ${JSON.stringify(ratio)})
      .map((entry) => {
        const meta = entry.META || {};
        const params = normalizeParamDefs(meta.params);
        const probeParams = Object.fromEntries(params.map((param) => [param.name, normalizeParamValue(param)]));
        const defaultParams = Object.fromEntries(params.filter((param) => param.hasDefault).map((param) => [param.name, param.defaultValue]));
        const probeDescribe = readDescribeParams(meta, probeParams);
        const defaultDescribe = readDescribeParams(meta, defaultParams);
        return {
          id: typeof meta.id === "string" ? meta.id : entry.id,
          ratio: typeof meta.ratio === "string" ? meta.ratio : undefined,
          description: typeof meta.description === "string" ? meta.description : undefined,
          params,
          contractAllowedParams: probeDescribe ? Object.keys(probeDescribe) : params.map((param) => param.name),
          contractDefaultedParams: defaultDescribe
            ? Object.keys(defaultDescribe).filter((key) => Object.prototype.hasOwnProperty.call(defaultParams, key))
            : params.filter((param) => param.hasDefault).map((param) => param.name),
        };
      });
    process.stdout.write(JSON.stringify(scenes));
  `;

  try {
    const stdout = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
    });
    const parsed = JSON.parse(stdout) as unknown[];
    const normalized = parsed.map(normalizeSceneSpec).filter((entry): entry is SceneSpec => entry !== null);
    SCENE_SPEC_CACHE.set(ratio, normalized);
    return normalized;
  } catch {
    SCENE_SPEC_CACHE.set(ratio, []);
    return [];
  }
}

export async function buildStubPlan(ctx: PlanCtx): Promise<SegmentPlan[]> {
  const segments = getSegmentsFromPlanCtx(ctx);
  const scenes = await loadSceneSpecsForPlan(ctx);
  if (segments.length > 0 && scenes.length === 0) {
    throw new Error(`Fix: scene-per-segment cannot plan without scenes for ratio '${getRatioFromPlanCtx(ctx)}'`);
  }
  const hint = getUserHint(ctx);
  const fallback = pickFallbackScene(scenes);

  return segments.map((segment, index) => {
    const candidates = rankScenesForSegment(scenes, segment, hint);
    for (const scene of candidates) {
      const params = buildParamsForScene(scene, segment);
      if (params !== null) {
        return addEmphasis({
          segmentId: segment.id,
          scene: scene.id,
          params,
        }, segment, index);
      }
    }

    return addEmphasis({
      segmentId: segment.id,
      scene: fallback?.id || "@prev",
      params: buildFallbackParams(fallback, segment),
    }, segment, index);
  });
}

function addEmphasis(plan: SegmentPlan, segment: Segment, index: number): SegmentPlan {
  const emphasis: string[] = [];
  if (hasNumber(segment.text)) {
    emphasis.push("number");
  }
  if (hasCodeishText(segment.text)) {
    emphasis.push("code");
  }
  if (segment.text.trim().length >= 48) {
    emphasis.push("long");
  }
  if (index === 0) {
    emphasis.push("opening");
  }
  return emphasis.length > 0 ? { ...plan, emphasis } : plan;
}

function getUserHint(ctx: PlanCtx): string {
  const options = ctx.options && typeof ctx.options === "object" ? ctx.options as Record<string, unknown> : null;
  const hintValue =
    ctx.hint
    ?? ctx.userHint
    ?? options?.hint
    ?? options?.scene
    ?? ctx.match?.hint;
  return typeof hintValue === "string" ? hintValue.trim().toLowerCase() : "";
}

function normalizeParamDefs(raw: unknown): SceneParamDef[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((entry): entry is SceneParam => Boolean(entry) && typeof entry === "object" && typeof entry.name === "string")
      .map((entry) => ({
        name: entry.name,
        type: entry.type,
        required: entry.required === true,
        hasDefault: Object.prototype.hasOwnProperty.call(entry, "default"),
        defaultValue: entry.default,
      }));
  }

  if (!raw || typeof raw !== "object") {
    return [];
  }

  return Object.entries(raw as Record<string, { type?: string; required?: boolean; default?: unknown }>)
    .map(([name, value]) => ({
      name,
      type: value?.type,
      required: value?.required === true,
      hasDefault: Boolean(value && Object.prototype.hasOwnProperty.call(value, "default")),
      defaultValue: value?.default,
    }));
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}
