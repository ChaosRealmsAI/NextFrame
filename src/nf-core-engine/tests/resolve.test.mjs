import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve as pathResolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource, resolve as resolveStage, loadTracksFor, StageErrorException } from '../dist/engine-lib.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = pathResolve(__dirname, '../../..');
const demoPath = pathResolve(repoRoot, 'spec/versions/v1.1/spec/demo.sample.json');

test('resolve: demo.sample.json resolves', () => {
  const text = readFileSync(demoPath, 'utf8');
  const parsed = parseSource(text, demoPath);
  const cwd = dirname(demoPath);
  const loaded = loadTracksFor(parsed.tracks, cwd);
  const loader = (id) => {
    const t = loaded.get(id);
    return t && t.describe ? t.describe : null;
  };
  const r = resolveStage(parsed, loader);
  assert.equal(r.duration_ms, 10000);
  assert.equal(r.anchors.demo.begin_ms, 0);
  assert.equal(r.anchors.demo.end_ms, 10000);
  assert.equal(r.anchors.intro.end_ms, 3000);
  assert.equal(r.anchors.midpoint.begin_ms, 3000);
  assert.equal(r.anchors.midpoint.end_ms, 7000);
  assert.equal(r.anchors.outro.begin_ms, 7000);
  assert.equal(r.tracks[0].clips.length, 3);
});

test('resolve: viewport ratio mismatch errors', () => {
  const bad = JSON.stringify({
    viewport: { ratio: '16:9', w: 1000, h: 1000 },
    duration: '1s',
    tracks: [{ id: 't', kind: 'scene', src: './x.js', clips: [{ begin: '0', end: '1s', params: {} }] }],
  });
  const parsed = parseSource(bad);
  assert.throws(
    () => resolveStage(parsed, () => null),
    (e) => e instanceof StageErrorException && e.err.code === 'E_VIEWPORT',
  );
});

test('resolve: negative time detected', () => {
  const bad = JSON.stringify({
    viewport: { ratio: '1:1', w: 100, h: 100 },
    duration: '1s',
    anchors: { a: { begin: '2s', end: '1s' } },
    tracks: [{ id: 't', kind: 'scene', src: './x.js', clips: [{ begin: 'a.begin', end: 'a.end', params: {} }] }],
  });
  const parsed = parseSource(bad);
  assert.throws(
    () => resolveStage(parsed, () => null),
    (e) => e instanceof StageErrorException && e.err.code === 'E_NEGATIVE_TIME',
  );
});
