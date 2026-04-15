import type { AudioTrack, PlanCtx, SceneEntry, SceneParam, Segment } from "../types.js";
import { listScenesForRatio } from "../scenes/index.js";

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
}

const TEXT_PARAM_NAMES = [
  "text",
  "quote",
  "title",
  "headline",
  "caption",
  "summary",
  "description",
  "label",
];

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

export function pickFallbackScene(scenes: SceneSpec[]): SceneSpec | null {
  return (
    scenes.find((scene) => scene.id === "headlineCenter")
    || scenes.find((scene) => TEXT_PARAM_NAMES.some((name) => hasParam(scene, name)))
    || scenes[0]
    || null
  );
}

export function buildFallbackParams(scene: SceneSpec | null, segment: Segment): Record<string, unknown> {
  if (!scene) {
    return {};
  }
  const primaryTextParam = TEXT_PARAM_NAMES.find((name) => hasParam(scene, name));
  if (primaryTextParam) {
    return { [primaryTextParam]: segment.text };
  }
  return {};
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

function rankScenesForSegment(scenes: SceneSpec[], segment: Segment, hint: string): SceneSpec[] {
  return [...scenes]
    .map((scene, index) => ({
      scene,
      score: scoreScene(scene, segment, hint) - index / 1000,
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.scene);
}

function scoreScene(scene: SceneSpec, segment: Segment, hint: string): number {
  const haystack = `${scene.id} ${scene.description || ""}`.toLowerCase();
  const text = segment.text.trim();
  const short = text.length <= 40;
  const long = text.length >= 88;
  const codeish = hasCodeishText(text);
  const numeric = hasNumber(text);
  const codeScene = supportsCodeScene(scene, haystack);
  const numberScene = supportsNumberScene(scene, haystack);
  const textScene = TEXT_PARAM_NAMES.some((name) => hasParam(scene, name));
  let score = 0;

  if (hint) {
    if (scene.id.toLowerCase() === hint) {
      score += 1000;
    } else if (haystack.includes(hint)) {
      score += 160;
    }
  }

  if (codeish) {
    if (codeScene) {
      score += 260;
    } else if (textScene) {
      score -= 120;
    } else {
      score -= 40;
    }
  } else if (codeScene) {
    score -= 20;
  }

  if (numeric) {
    if (numberScene) {
      score += 220;
    } else if (textScene) {
      score -= 60;
    } else {
      score -= 20;
    }
  } else if (numberScene) {
    score -= 10;
  }

  if (short && !codeish && !numeric) {
    if (/(headline|quote|golden)/i.test(scene.id) || /(headline|quote|title)/i.test(haystack)) {
      score += 70;
    }
  }

  if (long && !codeish) {
    if (/(quote|key|compare|topic|headline)/i.test(scene.id) || /(quote|key|compare|topic)/i.test(haystack)) {
      score += 60;
    }
  }

  if (scene.id === "headlineCenter") {
    score += 55;
  }

  if (textScene && !codeish && !numeric) {
    score += 25;
  }

  return score;
}

function buildParamsForScene(scene: SceneSpec, segment: Segment): Record<string, unknown> | null {
  const params: Record<string, unknown> = {};
  const numberMatch = segment.text.match(/-?\d+(?:[.,]\d+)?%?/);
  const code = extractCodeSnippet(segment.text);
  const rows = [{ text: segment.text }];
  const command = segment.text.trim().replace(/^`+|`+$/g, "");

  for (const param of scene.params) {
    const value = inferParamValue(param, segment.text, {
      number: numberMatch?.[0],
      code,
      command,
      rows,
    });
    if (value !== undefined) {
      params[param.name] = value;
      continue;
    }
    if (param.required && !param.hasDefault) {
      return null;
    }
  }

  return params;
}

function inferParamValue(
  param: SceneParamDef,
  text: string,
  derived: {
    number?: string;
    code?: string;
    command: string;
    rows: Array<Record<string, unknown>>;
  },
): unknown {
  const name = param.name.toLowerCase();

  if (TEXT_PARAM_NAMES.includes(name)) {
    return text;
  }
  if (name === "number" && derived.number) {
    return derived.number;
  }
  if (name === "unit" && derived.number) {
    return extractUnit(text, derived.number);
  }
  if (name === "code" && derived.code) {
    return derived.code;
  }
  if (name === "lines" && derived.code) {
    return derived.code.split("\n");
  }
  if (name === "command" && hasCodeishText(text)) {
    return derived.command;
  }
  if (name === "rows" && hasCodeishText(text)) {
    return derived.rows;
  }
  if (name === "filename" && derived.code) {
    return guessFilename(text);
  }
  if (name === "language" && derived.code) {
    return guessLanguage(text);
  }
  if ((name === "kicker" || name === "sub") && derived.number) {
    return text;
  }
  if ((name === "caption" || name === "summary") && derived.number) {
    return text;
  }
  return undefined;
}

function extractCodeSnippet(text: string): string | undefined {
  const trimmed = text.trim();
  if (!hasCodeishText(trimmed)) {
    return undefined;
  }
  const fenced = trimmed.match(/```[a-zA-Z0-9_-]*\n([\s\S]+?)```/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  if (/^`[^`].*`$/s.test(trimmed)) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function extractUnit(text: string, numberToken: string): string {
  const idx = text.indexOf(numberToken);
  if (idx < 0) {
    return "";
  }
  const suffix = text.slice(idx + numberToken.length).trim();
  const match = suffix.match(/^([\p{L}%]+|[a-zA-Z]+)\b/u);
  return match?.[1] || "";
}

function guessFilename(text: string): string {
  const fileMatch = text.match(/\b[\w.-]+\.(ts|tsx|js|jsx|json|rs|py|md)\b/i);
  return fileMatch?.[0] || "snippet.txt";
}

function guessLanguage(text: string): string {
  if (/\b(fn|let|const|import|export|interface|type)\b/.test(text)) {
    return /:\s*[A-Z][A-Za-z0-9_<>,[\]\s|]+/.test(text) ? "typescript" : "javascript";
  }
  if (/\b(def|import |from |print\()/.test(text)) {
    return "python";
  }
  if (/\b(pub|impl|let mut|fn )/.test(text)) {
    return "rust";
  }
  return "text";
}

function hasParam(scene: SceneSpec, name: string): boolean {
  return scene.params.some((param) => param.name === name);
}

function supportsCodeScene(scene: SceneSpec, haystack: string): boolean {
  return (
    /(code|terminal|inject|path)/i.test(scene.id)
    || /(code|terminal|shell|cli)/i.test(haystack)
    || ["code", "lines", "command", "rows", "filename", "language"].some((name) => hasParam(scene, name))
  );
}

function supportsNumberScene(scene: SceneSpec, haystack: string): boolean {
  return (
    /(stat|number|metric|count|score)/i.test(scene.id)
    || /(number|metric|digit|stat)/i.test(haystack)
    || ["number", "unit", "value", "metric"].some((name) => hasParam(scene, name))
  );
}

function hasCodeishText(text: string): boolean {
  return /[`{}[\]();<>/=]|(^|\s)(npm|npx|pnpm|yarn|cargo|git|node|cd|ls|rm|cp|mv)\b|\w+\(/.test(text);
}

function hasNumber(text: string): boolean {
  return /\d/.test(text);
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
