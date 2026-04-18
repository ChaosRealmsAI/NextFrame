// Stage 1: parse source.json.
// Input: raw JSON text.
// Output: ParseOutput (AST per anchor + ref graph).

import Ajv from 'ajv';
import { parseExpr, collectRefs, ExprParseError } from './expr.js';
import { topologicalOrder, CycleError } from './topo.js';
import {
  ParseOutput,
  ParsedAnchor,
  ParsedClip,
  SourceRaw,
  StageErrorException,
  StageError,
  AnchorRaw,
  ExprAST,
} from './types.js';

// Source JSON Schema (v1.1 interfaces §2). Inline to keep engine self-contained.
const SOURCE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: ['viewport', 'duration', 'tracks'],
  additionalProperties: true,
  properties: {
    viewport: {
      type: 'object',
      required: ['ratio', 'w', 'h'],
      additionalProperties: true,
      properties: {
        ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'] },
        w: { type: 'integer', minimum: 1, maximum: 7680 },
        h: { type: 'integer', minimum: 1, maximum: 4320 },
      },
    },
    duration: { type: 'string' },
    anchors: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        oneOf: [
          {
            required: ['at'],
            additionalProperties: false,
            properties: {
              at: { type: 'string' },
              filler: { type: 'string' },
            },
          },
          {
            required: ['begin', 'end'],
            additionalProperties: false,
            properties: {
              begin: { type: 'string' },
              end: { type: 'string' },
              filler: { type: 'string' },
            },
          },
        ],
      },
    },
    tracks: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'kind', 'src', 'clips'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-zA-Z_][a-zA-Z0-9_-]*$' },
          kind: { type: 'string' },
          src: { type: 'string' },
          clips: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['begin', 'end', 'params'],
              additionalProperties: false,
              properties: {
                id: { type: 'string' },
                begin: { type: 'string' },
                end: { type: 'string' },
                params: { type: 'object' },
              },
            },
          },
        },
      },
    },
    meta: { type: 'object' },
  },
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validateSource = ajv.compile(SOURCE_SCHEMA);

function parseError(code: string, message: string, fix_hint?: string, extra?: Partial<StageError['loc']>): StageErrorException {
  const err: StageError = { stage: 'parse', code, message };
  if (fix_hint !== undefined) err.fix_hint = fix_hint;
  if (extra !== undefined) err.loc = extra;
  return new StageErrorException(err);
}

function isPointAnchor(a: AnchorRaw): a is { at: string; filler?: string } {
  return typeof (a as { at?: unknown }).at === 'string';
}

export function parseSource(text: string, file?: string): ParseOutput {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const err: StageError = {
      stage: 'parse',
      code: 'E_JSON_SYNTAX',
      message: `JSON.parse failed: ${msg}`,
      fix_hint: 'Check source.json is valid JSON.',
    };
    if (file !== undefined) err.loc = { file };
    throw new StageErrorException(err);
  }

  if (!validateSource(raw)) {
    const first = (validateSource.errors ?? [])[0];
    throw parseError(
      'E_SCHEMA',
      `source.json schema validation failed: ${first?.instancePath ?? ''} ${first?.message ?? ''}`,
      'Fix the source.json to match schema (viewport / tracks / anchors).',
      file !== undefined ? { file } : undefined,
    );
  }

  const source = raw as SourceRaw;

  // Parse duration expression.
  let durationExpr;
  try {
    durationExpr = parseExpr(source.duration);
  } catch (e) {
    if (e instanceof ExprParseError) {
      throw parseError('E_EXPR_SYNTAX', `duration expr: ${e.message}`, 'Use e.g. "10s", "500ms", or "foo.end".', {
        expr: e.expr,
        col: e.col,
      });
    }
    throw e;
  }

  // Parse all anchor expressions.
  const anchors = new Map<string, ParsedAnchor>();
  const anchorSources: Record<string, AnchorRaw> = source.anchors ?? {};
  for (const [name, a] of Object.entries(anchorSources)) {
    try {
      if (isPointAnchor(a)) {
        const at = parseExpr(a.at);
        const pa: ParsedAnchor = { name, kind: 'point', exprs: { at } };
        if (a.filler !== undefined) pa.filler = a.filler;
        anchors.set(name, pa);
      } else {
        const begin = parseExpr(a.begin);
        const end = parseExpr(a.end);
        const ra: ParsedAnchor = { name, kind: 'range', exprs: { begin, end } };
        if (a.filler !== undefined) ra.filler = a.filler;
        anchors.set(name, ra);
      }
    } catch (e) {
      if (e instanceof ExprParseError) {
        throw parseError('E_EXPR_SYNTAX', `anchor '${name}': ${e.message}`, "Fix expr; see PEG grammar (interfaces §3).", {
          anchor_name: name,
          expr: e.expr,
          col: e.col,
        });
      }
      throw e;
    }
  }

  // Parse clip begin/end exprs.
  const parsedClips: ParsedClip[] = [];
  for (const track of source.tracks) {
    let i = 0;
    for (const clip of track.clips) {
      const cid = clip.id ?? `${track.id}#${i}`;
      try {
        const beginExpr = parseExpr(clip.begin);
        const endExpr = parseExpr(clip.end);
        parsedClips.push({
          id: cid,
          trackId: track.id,
          beginExpr,
          endExpr,
          params: clip.params,
        });
      } catch (e) {
        if (e instanceof ExprParseError) {
          throw parseError('E_EXPR_SYNTAX', `clip '${cid}': ${e.message}`, 'Check clip.begin / clip.end.', {
            clip_id: cid,
            expr: e.expr,
            col: e.col,
          });
        }
        throw e;
      }
      i++;
    }
  }

  // Build refGraph: each anchor -> list of anchor names it depends on.
  // Intra-anchor references (e.g. range anchor whose .end refs its own .begin) are permitted:
  // within a single anchor we evaluate begin/at before end, so self-edges are dropped here.
  const refGraph: Record<string, string[]> = {};
  for (const [name, pa] of anchors.entries()) {
    const deps = new Set<string>();
    for (const ast of Object.values(pa.exprs)) {
      if (ast) for (const r of collectRefs(ast)) if (r !== name) deps.add(r);
    }
    refGraph[name] = [...deps];
  }

  // Check unknown refs across anchors, duration, and clips.
  const anchorNames = new Set(anchors.keys());
  const checkRefs = (ast: ExprAST | undefined, ctx: StageError['loc']): void => {
    if (!ast) return;
    for (const r of collectRefs(ast)) {
      if (!anchorNames.has(r)) {
        throw parseError(
          'E_ANCHOR_UNDEFINED',
          `references undefined anchor '${r}'`,
          `Define '${r}' in anchors{} or fix the typo.`,
          ctx,
        );
      }
    }
  };
  for (const [name, pa] of anchors.entries()) {
    for (const ast of Object.values(pa.exprs)) {
      // Intra-anchor refs to self are OK (handled in resolve).
      if (!ast) continue;
      for (const r of collectRefs(ast)) {
        if (r === name) continue;
        if (!anchorNames.has(r)) {
          throw parseError(
            'E_ANCHOR_UNDEFINED',
            `anchor '${name}' references undefined anchor '${r}'`,
            `Define '${r}' in anchors{} or fix the typo.`,
            { anchor_name: name },
          );
        }
      }
    }
  }
  checkRefs(durationExpr, {});
  for (const pc of parsedClips) {
    checkRefs(pc.beginExpr, { clip_id: pc.id });
    checkRefs(pc.endExpr, { clip_id: pc.id });
  }

  // Check cycles early (pure anchor DAG; clip refs resolved in resolve stage).
  try {
    topologicalOrder(refGraph);
  } catch (e) {
    if (e instanceof CycleError) {
      throw parseError('E_ANCHOR_CYCLE', `anchor cycle: ${e.chain.join(' -> ')}`, 'Break the cycle — at least one anchor must depend only on literals.', {
        anchor_name: e.chain[0],
      });
    }
    throw e;
  }

  return {
    viewport: source.viewport,
    durationExpr,
    anchors,
    tracks: source.tracks,
    parsedClips,
    refGraph,
    raw: source,
  };
}
