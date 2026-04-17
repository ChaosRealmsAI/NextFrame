// JSON parser for NextFrame Source. JSON.parse preserves key insertion order
// in modern V8 for string keys, so the raw object round-trips predictably.

export interface Viewport {
  ratio: string;
  w: number;
  h: number;
}

export type AnchorExprNode = { ref: string } | { expr: string } | number;

export interface SourceAst {
  raw: Record<string, unknown>;
  viewport: Viewport;
  tracks: unknown[];
  anchors: Record<string, AnchorExprNode>;
}

export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseSource(text: string): SourceAst {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new ParseError(`invalid JSON: ${(e as Error).message}`);
  }
  if (!isRecord(raw)) {
    throw new ParseError("source must be a JSON object");
  }
  if (!isRecord(raw.viewport)) {
    throw new ParseError("source.viewport is required");
  }
  const vp = raw.viewport;
  if (typeof vp.ratio !== "string" || typeof vp.w !== "number" || typeof vp.h !== "number") {
    throw new ParseError("viewport must have {ratio, w, h}");
  }
  const tracks = Array.isArray(raw.tracks) ? (raw.tracks as unknown[]) : [];
  const anchors: Record<string, AnchorExprNode> = {};
  if (raw.anchors !== undefined) {
    if (!isRecord(raw.anchors)) {
      throw new ParseError("anchors must be an object");
    }
    for (const [key, value] of Object.entries(raw.anchors)) {
      anchors[key] = normalizeAnchor(key, value);
    }
  }
  return {
    raw,
    viewport: { ratio: vp.ratio, w: vp.w, h: vp.h },
    tracks,
    anchors,
  };
}

function normalizeAnchor(key: string, value: unknown): AnchorExprNode {
  if (typeof value === "number") return value;
  if (typeof value === "string") return { expr: value };
  if (isRecord(value)) {
    if (typeof value.ref === "string") return { ref: value.ref };
    if (typeof value.expr === "string") return { expr: value.expr };
  }
  throw new ParseError(`anchor "${key}" must be number | string | {ref} | {expr}`);
}
