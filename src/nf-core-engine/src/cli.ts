// Engine subprocess entry.
// Reads stdin JSON lines {cmd, args}, writes stdout JSON lines {event, ...} or {error}.
// Stdout is strictly JSON-only (rule-ai-operable). All errors routed through error envelope.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';

import { parseSource } from './parser.js';
import { resolve as resolveStage, TrackDescribeLoader } from './resolve.js';
import { bundle } from './bundler.js';
import { rename } from './rename.js';
import { parseExpr } from './expr.js';
import { loadTracksFor } from './track-loader.js';
import { ParseOutput, Resolved, StageError, StageErrorException } from './types.js';

const DEFAULT_RUNTIME_PLACEHOLDER = `/* nf-runtime placeholder · T4-RUNTIME not yet produced.
   Minimal boot that paints a diagnostic banner so the bundle renders something visible. */
(function(){
  function boot(){
    var stage = document.getElementById('nf-stage');
    if(!stage) return;
    var resolvedEl = document.getElementById('nf-resolved');
    var data = {};
    try { data = JSON.parse(resolvedEl.textContent||'{}'); } catch(e){}
    stage.innerHTML = '<div style="color:#fff;font-family:-apple-system,sans-serif;padding:32px;max-width:960px;line-height:1.6"><h1 style="margin:0 0 16px;font-size:28px">NextFrame bundle</h1><p style="opacity:0.75">runtime placeholder · '+ (data.tracks?data.tracks.length:0) +' track(s) · duration '+ (data.duration_ms||0) +'ms</p></div>';
  }
  if(typeof window !== 'undefined'){
    window.__nf_boot = boot;
    window.__nf = {
      getState: function(){ return { mode:'play', t_ms:0, playing:false }; },
      screenshot: function(){ return Promise.resolve('data:image/png;base64,'); },
      log: function(level,msg,data){ try{console.log(JSON.stringify({level:level,msg:msg,data:data||null,source:'nf-runtime-stub'}));}catch(e){} }
    };
  }
})();`;

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

function buildRuntime(runtimePath: string | undefined): string {
  // Priority 1: explicit --runtime arg
  if (runtimePath && existsSync(runtimePath)) {
    try {
      return readFileSync(runtimePath, 'utf8');
    } catch { /* fall through */ }
  }
  // Priority 2: env var NF_RUNTIME_PATH
  if (process.env.NF_RUNTIME_PATH && existsSync(process.env.NF_RUNTIME_PATH)) {
    try {
      return readFileSync(process.env.NF_RUNTIME_PATH, 'utf8');
    } catch { /* fall through */ }
  }
  // Priority 3: auto-discover sibling nf-runtime/dist/runtime-iife.js (workspace layout)
  // engine.js lives at src/nf-core-engine/dist/engine.js → sibling is src/nf-runtime/dist/
  const candidates = [
    pathResolve(process.cwd(), 'src/nf-runtime/dist/runtime-iife.js'),
    pathResolve(process.cwd(), '../nf-runtime/dist/runtime-iife.js'),
    pathResolve(process.cwd(), 'dist/runtime-iife.js'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        return readFileSync(c, 'utf8');
      } catch { /* keep trying */ }
    }
  }
  return DEFAULT_RUNTIME_PLACEHOLDER;
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

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function handleCmd(input: Cmd): void {
  try {
    switch (input.cmd) {
      case 'parse': return doParse(input.args);
      case 'resolve': return doResolve(input.args);
      case 'build': return doBuild(input.args);
      case 'validate': return doValidate(input.args);
      case 'anchors': return doAnchors(input.args);
      case 'rename-anchor': return doRename(input.args);
      case 'load-track-describe': return doLoadTrack(input.args);
      case 'ping': return emit({ event: 'pong' });
      default:
        emitError('parse', 'E_UNKNOWN_CMD', `unknown cmd '${input.cmd}'`, 'Valid: parse / resolve / build / validate / anchors / rename-anchor / load-track-describe / ping');
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

function doBuild(args: Record<string, unknown>): void {
  const source = String(args.source ?? '');
  const out = String(args.out ?? '');
  const pretty = Boolean(args.pretty ?? false);
  const runtime = args.runtime !== undefined ? String(args.runtime) : undefined;
  if (!source || !out) throw new StageErrorException({ stage: 'parse', code: 'E_ARGS', message: "missing 'source' or 'out'" });

  const text = loadSourceText(source);
  const parsed = parseSource(text, source);
  const sourceDir = dirname(pathResolve(source));
  const { loader, loaded } = makeLoader(parsed, sourceDir);
  const resolved: Resolved = resolveStage(parsed, loader);

  // Track sources map.
  const trackSources: Record<string, string> = {};
  for (const [id, t] of loaded.entries()) trackSources[id] = t.source_text;

  const runtimeJs = buildRuntime(runtime);
  const html = bundle({ resolved, trackSources, runtimeJs, pretty });

  mkdirSync(dirname(pathResolve(out)), { recursive: true });
  writeFileSync(out, html, 'utf8');

  emit({
    event: 'build.done',
    out,
    bytes: Buffer.byteLength(html, 'utf8'),
    anchors_resolved: Object.keys(resolved.anchors).length,
    tracks_bundled: resolved.tracks.length,
    duration_ms: resolved.duration_ms,
    sha256: sha256(html),
  });
}

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
