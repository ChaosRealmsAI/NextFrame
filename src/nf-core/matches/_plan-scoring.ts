import type { Segment } from "../types.js";
import type { SceneParamDef, SceneSpec } from "./_plan-heuristics.js";

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

export function rankScenesForSegment(scenes: SceneSpec[], segment: Segment, hint: string): SceneSpec[] {
  return [...scenes]
    .map((scene, index) => ({
      scene,
      score: scoreScene(scene, segment, hint) - index / 1000,
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.scene);
}

export function buildParamsForScene(scene: SceneSpec, segment: Segment): Record<string, unknown> | null {
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

export function hasCodeishText(text: string): boolean {
  return /[`{}[\]();<>/=]|(^|\s)(npm|npx|pnpm|yarn|cargo|git|node|cd|ls|rm|cp|mv)\b|\w+\(/.test(text);
}

export function hasNumber(text: string): boolean {
  return /\d/.test(text);
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
