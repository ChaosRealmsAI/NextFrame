// Stage 2: resolve anchor exprs to absolute ms, validate clip.params against Track schemas.
// Input: ParseOutput + trackDescribeLoader (trackId -> { id, params JSON schema, viewport }).
// Output: Resolved.

import Ajv from 'ajv';
import { topologicalOrder } from './topo.js';
import {
  ExprAST,
  ParseOutput,
  ParsedAnchor,
  Resolved,
  ResolvedAnchor,
  ResolvedClip,
  ResolvedTrack,
  StageError,
  StageErrorException,
} from './types.js';

export interface TrackDescriptor {
  id: string;
  name?: string;
  viewport?: string;
  params: Record<string, unknown>;
}

export type TrackDescribeLoader = (trackId: string, src: string) => TrackDescriptor | null;

function resolveError(
  code: string,
  message: string,
  fix_hint?: string,
  loc?: StageError['loc'],
): StageErrorException {
  const err: StageError = { stage: 'resolve', code, message };
  if (fix_hint !== undefined) err.fix_hint = fix_hint;
  if (loc !== undefined) err.loc = loc;
  return new StageErrorException(err);
}

// Resolve an anchor's fields given already-resolved anchors.
function evalExpr(ast: ExprAST, resolvedAnchors: Record<string, ResolvedAnchor>, context: { anchor_name?: string; clip_id?: string }): number {
  if (ast.type === 'dur') return ast.ms;
  if (ast.type === 'binop') {
    const l = evalExpr(ast.left, resolvedAnchors, context);
    const r = evalExpr(ast.right, resolvedAnchors, context);
    return ast.op === '+' ? l + r : l - r;
  }
  // ref
  const head = ast.path[0]!;
  const field = ast.path[1];
  const ra = resolvedAnchors[head];
  if (!ra) {
    const loc: StageError['loc'] = {};
    if (context.anchor_name !== undefined) loc.anchor_name = context.anchor_name;
    if (context.clip_id !== undefined) loc.clip_id = context.clip_id;
    throw resolveError('E_ANCHOR_UNRESOLVED', `anchor '${head}' not resolved yet`, 'Check topo order / undefined anchor.', loc);
  }
  if (field === undefined) {
    // Single ident: point -> at, range -> begin.
    if (ra.kind === 'point') return ra.at_ms ?? 0;
    return ra.begin_ms ?? 0;
  }
  if (field === 'at') {
    if (ra.kind !== 'point') throw resolveError('E_ANCHOR_FIELD', `'${head}.at' used on range anchor`, "Use '.begin' or '.end' on range anchors.", { anchor_name: head });
    return ra.at_ms ?? 0;
  }
  if (field === 'begin') {
    if (ra.kind !== 'range') throw resolveError('E_ANCHOR_FIELD', `'${head}.begin' used on point anchor`, "Use '.at' on point anchors.", { anchor_name: head });
    return ra.begin_ms ?? 0;
  }
  if (field === 'end') {
    if (ra.kind !== 'range') throw resolveError('E_ANCHOR_FIELD', `'${head}.end' used on point anchor`, "Use '.at' on point anchors.", { anchor_name: head });
    return ra.end_ms ?? 0;
  }
  throw resolveError('E_ANCHOR_FIELD', `unknown anchor field '${head}.${field}'`, "Valid fields: .at | .begin | .end", { anchor_name: head });
}

function resolveAnchor(pa: ParsedAnchor, resolvedAnchors: Record<string, ResolvedAnchor>): ResolvedAnchor {
  if (pa.kind === 'point') {
    const at_ms = Math.round(evalExpr(pa.exprs.at!, resolvedAnchors, { anchor_name: pa.name }));
    return { kind: 'point', at_ms };
  }
  const begin_ms = Math.round(evalExpr(pa.exprs.begin!, resolvedAnchors, { anchor_name: pa.name }));
  // Insert partial begin so '.end' expression may reference self.begin.
  resolvedAnchors[pa.name] = { kind: 'range', begin_ms, end_ms: begin_ms };
  const end_ms = Math.round(evalExpr(pa.exprs.end!, resolvedAnchors, { anchor_name: pa.name }));
  if (end_ms < begin_ms) {
    throw resolveError(
      'E_NEGATIVE_TIME',
      `range anchor '${pa.name}' has end(${end_ms}) < begin(${begin_ms})`,
      'Ensure end expr resolves >= begin expr.',
      { anchor_name: pa.name },
    );
  }
  return { kind: 'range', begin_ms, end_ms };
}

function validateViewport(viewport: ParseOutput['viewport']): void {
  const { ratio, w, h } = viewport;
  const [rw, rh] = ratio.split(':').map(Number);
  if (!rw || !rh) {
    throw resolveError('E_VIEWPORT', `invalid ratio '${ratio}'`, 'Ratio must be like 16:9 / 9:16 / 1:1.');
  }
  const expected = rw / rh;
  const actual = w / h;
  if (Math.abs(expected - actual) > 0.01) {
    throw resolveError(
      'E_VIEWPORT',
      `viewport ratio ${ratio} does not match ${w}x${h} (expected ratio ${expected.toFixed(3)}, got ${actual.toFixed(3)})`,
      'Match w/h to ratio, or fix ratio.',
    );
  }
}

export function resolve(parsed: ParseOutput, loadDescribe: TrackDescribeLoader): Resolved {
  validateViewport(parsed.viewport);

  // Topo order of anchors.
  const order = topologicalOrder(parsed.refGraph);
  const resolvedAnchors: Record<string, ResolvedAnchor> = {};
  for (const name of order) {
    const pa = parsed.anchors.get(name);
    if (!pa) continue;
    resolvedAnchors[name] = resolveAnchor(pa, resolvedAnchors);
  }

  // Resolve duration.
  const duration_ms = Math.round(evalExpr(parsed.durationExpr, resolvedAnchors, {}));
  if (duration_ms <= 0) {
    throw resolveError('E_DURATION', `duration_ms=${duration_ms} must be > 0`, 'Check duration expr.');
  }

  // Resolve clips + validate params.
  const ajv = new Ajv({ allErrors: true, strict: false });
  const schemaCache = new Map<string, ReturnType<Ajv['compile']>>();

  const resolvedTracks: ResolvedTrack[] = [];
  for (const track of parsed.tracks) {
    const descriptor = loadDescribe(track.id, track.src);
    let validator: ReturnType<Ajv['compile']> | null = null;
    if (descriptor && descriptor.params) {
      const cacheKey = `${track.id}:${track.src}`;
      let v = schemaCache.get(cacheKey);
      if (!v) {
        try {
          v = ajv.compile(descriptor.params);
        } catch (e) {
          throw resolveError(
            'E_TRACK_SCHEMA',
            `track '${track.id}' describe().params is not a valid JSON Schema: ${e instanceof Error ? e.message : String(e)}`,
            'Fix describe() return shape.',
          );
        }
        schemaCache.set(cacheKey, v);
      }
      validator = v;
    }

    const rClips: ResolvedClip[] = [];
    const tracksClips = parsed.parsedClips.filter(c => c.trackId === track.id);
    for (const pc of tracksClips) {
      const begin_ms = Math.round(evalExpr(pc.beginExpr, resolvedAnchors, { clip_id: pc.id }));
      const end_ms = Math.round(evalExpr(pc.endExpr, resolvedAnchors, { clip_id: pc.id }));
      if (end_ms < begin_ms) {
        throw resolveError('E_NEGATIVE_TIME', `clip '${pc.id}' end(${end_ms}) < begin(${begin_ms})`, 'Fix clip.end expr.', { clip_id: pc.id });
      }
      if (begin_ms < 0) {
        throw resolveError('E_NEGATIVE_TIME', `clip '${pc.id}' begin_ms=${begin_ms} < 0`, 'Shift timeline or fix expr.', { clip_id: pc.id });
      }
      if (validator) {
        const ok = validator(pc.params);
        if (!ok) {
          const first = (validator.errors ?? [])[0];
          throw resolveError(
            'E_PARAMS',
            `clip '${pc.id}' params invalid: ${first?.instancePath ?? ''} ${first?.message ?? ''}`,
            `Match Track '${track.id}' describe().params schema.`,
            { clip_id: pc.id },
          );
        }
      }
      rClips.push({ id: pc.id, trackId: track.id, begin_ms, end_ms, params: pc.params });
    }

    resolvedTracks.push({ id: track.id, kind: track.kind, src: track.src, clips: rClips });
  }

  const out: Resolved = {
    viewport: parsed.viewport,
    duration_ms,
    anchors: resolvedAnchors,
    tracks: resolvedTracks,
  };
  if (parsed.raw.meta !== undefined) out.meta = parsed.raw.meta;
  return out;
}
