// Shared types across stages. Single source of truth for stage boundaries (FM-SHAPE).

export type ExprAST =
  | { type: 'dur'; ms: number }
  | { type: 'ref'; path: string[] }
  | { type: 'binop'; op: '+' | '-'; left: ExprAST; right: ExprAST };

export interface PointAnchorRaw {
  at: string;
  filler?: string;
}
export interface RangeAnchorRaw {
  begin: string;
  end: string;
  filler?: string;
}
export type AnchorRaw = PointAnchorRaw | RangeAnchorRaw;

export interface ClipRaw {
  id?: string;
  begin: string;
  end: string;
  params: Record<string, unknown>;
}

export interface TrackRaw {
  id: string;
  kind: string;
  src: string;
  clips: ClipRaw[];
}

export interface ViewportRaw {
  ratio: '16:9' | '9:16' | '1:1';
  w: number;
  h: number;
}

export interface SourceRaw {
  viewport: ViewportRaw;
  duration: string;
  anchors?: Record<string, AnchorRaw>;
  tracks: TrackRaw[];
  meta?: Record<string, unknown>;
}

// Parse stage output.
export interface ParsedAnchor {
  name: string;
  kind: 'point' | 'range';
  exprs: { at?: ExprAST; begin?: ExprAST; end?: ExprAST };
  filler?: string;
}
export interface ParsedClip {
  id: string;
  trackId: string;
  beginExpr: ExprAST;
  endExpr: ExprAST;
  params: Record<string, unknown>;
}

export interface ParseOutput {
  viewport: ViewportRaw;
  durationExpr: ExprAST;
  anchors: Map<string, ParsedAnchor>;
  tracks: TrackRaw[];
  parsedClips: ParsedClip[];
  refGraph: Record<string, string[]>;
  raw: SourceRaw;
}

// Resolve stage output.
export interface ResolvedAnchor {
  kind: 'point' | 'range';
  at_ms?: number;
  begin_ms?: number;
  end_ms?: number;
}
export interface ResolvedClip {
  id: string;
  trackId: string;
  begin_ms: number;
  end_ms: number;
  params: Record<string, unknown>;
}
export interface ResolvedTrack {
  id: string;
  kind: string;
  src: string;
  clips: ResolvedClip[];
}
export interface Resolved {
  viewport: ViewportRaw;
  duration_ms: number;
  anchors: Record<string, ResolvedAnchor>;
  tracks: ResolvedTrack[];
  meta?: Record<string, unknown>;
}

// Unified error shape. FM-SHAPE: same shape across stages.
export interface StageError {
  stage: 'parse' | 'resolve' | 'bundle';
  code: string;
  message: string;
  fix_hint?: string;
  loc?: {
    file?: string;
    anchor_name?: string;
    clip_id?: string;
    expr?: string;
    col?: number;
  };
}

export class StageErrorException extends Error {
  err: StageError;
  constructor(err: StageError) {
    super(err.message);
    this.err = err;
    this.name = 'StageErrorException';
  }
}
