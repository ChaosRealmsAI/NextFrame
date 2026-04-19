// Engine subprocess entry.
// Reads stdin JSON lines {cmd, args}, writes stdout JSON lines {event, ...} or {error}.
// Stdout is strictly JSON-only (rule-ai-operable). All errors routed through error envelope.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { createInterface } from 'node:readline';

import { parseSource } from './parser.js';
import { resolve as resolveStage, TrackDescribeLoader } from './resolve.js';
import { rename } from './rename.js';
import { loadTracksFor } from './track-loader.js';
import { ParseOutput, StageError, StageErrorException } from './types.js';

interface Cmd {
  cmd: string;
  args: Record<string, unknown>;
}

function emit(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function emitError(stage: StageError['stage'], code: string, message: string, fix_hint?: string, loc?: StageError['loc']): void {
  const err: StageError = { stage, code, message };
  if (fix_hint !== undefined) err.fix_hint = fix_hint;
  if (loc !== undefined) err.loc = loc;
  emit({ error: err });
}

function loadSourceText(sourcePath: string): string {
  return readFileSync(sourcePath, 'utf8');
}

function makeLoader(parsed: ParseOutput, sourceDir: string): { loader: TrackDescribeLoader; loaded: Map<string, { id: string; source_text: string }> } {
  const loaded = loadTracksFor(parsed.tracks, sourceDir);
  const loader: TrackDescribeLoader = (trackId) => {
    const t = loaded.get(trackId);
    if (!t || !t.describe) return null;
    return t.describe;
  };
  const simplified = new Map<string, { id: string; source_text: string }>();
  for (const [k, v] of loaded.entries()) simplified.set(k, { id: v.id, source_text: v.source_text });
  return { loader, loaded: simplified };
}

function handleCmd(input: Cmd): void {
  try {
    switch (input.cmd) {
      case 'parse': return doParse(input.args);
      case 'resolve': return doResolve(input.args);
      case 'validate': return doValidate(input.args);
      case 'anchors': return doAnchors(input.args);
      case 'rename-anchor': return doRename(input.args);
      case 'load-track-describe': return doLoadTrack(input.args);
      case 'ping': return emit({ event: 'pong' });
      default:
        emitError('parse', 'E_UNKNOWN_CMD', `unknown cmd '${input.cmd}'`, 'Valid: parse / resolve / validate / anchors / rename-anchor / load-track-describe / ping');
    }
  } catch (e) {
    if (e instanceof StageErrorException) {
      emit({ error: e.err });
    } else if (e instanceof Error) {
      emitError('parse', 'E_INTERNAL', e.message, 'Engine internal error; check args.');
    } else {
      emitError('parse', 'E_INTERNAL', String(e));
    }
  }
}

function doParse(args: Record<string, unknown>): void {
  const source = String(args.source ?? '');
  if (!source) throw new StageErrorException({ stage: 'parse', code: 'E_ARGS', message: "missing 'source' path" });
  const text = loadSourceText(source);
  const parsed = parseSource(text, source);
  emit({
    event: 'parse.done',
    anchors: [...parsed.anchors.keys()],
    tracks: parsed.tracks.map(t => t.id),
    refGraph: parsed.refGraph,
    duration_expr: parsed.raw.duration,
  });
}

function doResolve(args: Record<string, unknown>): void {
  const source = String(args.source ?? '');
  if (!source) throw new StageErrorException({ stage: 'parse', code: 'E_ARGS', message: "missing 'source' path" });
  const text = loadSourceText(source);
  const parsed = parseSource(text, source);
  const sourceDir = dirname(pathResolve(source));
  const { loader } = makeLoader(parsed, sourceDir);
  const resolved = resolveStage(parsed, loader);
  emit({ event: 'resolve.done', resolved });
}

function doValidate(args: Record<string, unknown>): void {
  const source = String(args.source ?? '');
  if (!source) throw new StageErrorException({ stage: 'parse', code: 'E_ARGS', message: "missing 'source' path" });
  const text = loadSourceText(source);
  const parsed = parseSource(text, source);
  const sourceDir = dirname(pathResolve(source));
  const { loader } = makeLoader(parsed, sourceDir);
  const resolved = resolveStage(parsed, loader);
  emit({
    event: 'validate.ok',
    anchors: Object.keys(resolved.anchors).length,
    tracks: resolved.tracks.length,
    clips: resolved.tracks.reduce((a, t) => a + t.clips.length, 0),
    duration_ms: resolved.duration_ms,
  });
}

function doAnchors(args: Record<string, unknown>): void {
  const source = String(args.source ?? '');
  if (!source) throw new StageErrorException({ stage: 'parse', code: 'E_ARGS', message: "missing 'source' path" });
  const text = loadSourceText(source);
  const parsed = parseSource(text, source);
  const sourceDir = dirname(pathResolve(source));
  const { loader } = makeLoader(parsed, sourceDir);
  const resolved = resolveStage(parsed, loader);
  const list: unknown[] = [];
  for (const [name, a] of Object.entries(resolved.anchors)) {
    const ref_by: string[] = [];
    for (const [other, deps] of Object.entries(parsed.refGraph)) {
      if (deps.includes(name)) ref_by.push(other);
    }
    list.push({ name, ...a, referenced_by: ref_by });
  }
  emit({ event: 'anchors.list', anchors: list });
}

function doRename(args: Record<string, unknown>): void {
  const source = String(args.source ?? '');
  const from = String(args.from ?? '');
  const to = String(args.to ?? '');
  const write = Boolean(args.write ?? false);
  if (!source || !from || !to) throw new StageErrorException({ stage: 'parse', code: 'E_ARGS', message: "missing 'source' / 'from' / 'to'" });
  const text = loadSourceText(source);
  const { new_source, changed_locations } = rename(text, from, to);
  if (write) writeFileSync(source, new_source, 'utf8');
  emit({ event: 'rename.done', from, to, changed_locations, new_source: write ? undefined : new_source });
}

function doLoadTrack(args: Record<string, unknown>): void {
  const source = String(args.source ?? '');
  if (!source) throw new StageErrorException({ stage: 'parse', code: 'E_ARGS', message: "missing 'source' path" });
  const text = loadSourceText(source);
  const parsed = parseSource(text, source);
  const sourceDir = dirname(pathResolve(source));
  const { loaded } = makeLoader(parsed, sourceDir);
  const out: Record<string, unknown> = {};
  for (const [id, t] of loaded.entries()) {
    out[id] = { id, bytes: t.source_text.length };
  }
  emit({ event: 'load-track-describe.done', tracks: out });
}

// `build` cmd removed in v1.20 (ADR-060 · bundle.html axed; nf-shell desktop app
// is the sole preview surface).

// ----------- Entry -----------
// Two modes: (a) read one {cmd,args} argument via `--cmd '{json}'` flag
// (b) default: line-oriented stdin loop.
// For v1.1 scaffolding, we support both so tests + Rust CLI can pick either.

function runOneShot(cmdJson: string): void {
  let parsed: Cmd;
  try {
    parsed = JSON.parse(cmdJson);
  } catch (e) {
    emitError('parse', 'E_ARG_JSON', 'failed to parse --cmd JSON', 'Provide a valid JSON object.');
    process.exitCode = 1;
    return;
  }
  handleCmd(parsed);
}

function runStdin(): void {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const cmd: Cmd = JSON.parse(trimmed);
      handleCmd(cmd);
    } catch {
      emitError('parse', 'E_STDIN_JSON', `failed to parse stdin line: ${trimmed.slice(0, 80)}`);
    }
  });
  rl.on('close', () => process.exit(0));
}

const argv = process.argv.slice(2);
const cmdIdx = argv.indexOf('--cmd');
if (cmdIdx >= 0 && argv[cmdIdx + 1] !== undefined) {
  runOneShot(argv[cmdIdx + 1]!);
} else {
  runStdin();
}
