// JSON parser that preserves key order. Stub: JSON.parse is already order-preserving
// for string-keyed objects in modern JS engines.

export interface SourceAst {
  raw: unknown;
  viewport: { ratio: string; w: number; h: number };
  tracks: unknown[];
}

export function parseSource(text: string): SourceAst {
  const raw = JSON.parse(text) as Record<string, unknown>;
  const viewport = (raw.viewport as SourceAst["viewport"]) ?? {
    ratio: "16:9",
    w: 1920,
    h: 1080,
  };
  const tracks = (raw.tracks as unknown[]) ?? [];
  return { raw, viewport, tracks };
}
