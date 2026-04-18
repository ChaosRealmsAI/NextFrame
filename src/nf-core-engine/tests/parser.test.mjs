import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSource, StageErrorException } from '../dist/engine-lib.js';

const demoPath = new URL('../../../spec/versions/v1.1/spec/demo.sample.json', import.meta.url);

test('parser: demo.sample.json parses', () => {
  const text = readFileSync(demoPath, 'utf8');
  const out = parseSource(text, demoPath.pathname);
  assert.ok(out.anchors.size >= 4, 'should have 4 anchors');
  assert.ok(out.tracks.length >= 1);
  assert.ok(out.parsedClips.length >= 3);
  assert.deepEqual(Object.keys(out.refGraph).sort(), ['demo', 'intro', 'midpoint', 'outro']);
});

test('parser: undefined anchor ref errors out', () => {
  const bad = JSON.stringify({
    viewport: { ratio: '16:9', w: 1920, h: 1080 },
    duration: 'ghost.end',
    anchors: { a: { at: '0' } },
    tracks: [{ id: 't', kind: 'scene', src: './x.js', clips: [{ begin: 'a', end: 'a', params: {} }] }],
  });
  assert.throws(() => parseSource(bad), (e) => {
    return e instanceof StageErrorException && e.err.stage === 'parse';
  });
});

test('parser: cycle detected', () => {
  const bad = JSON.stringify({
    viewport: { ratio: '16:9', w: 1920, h: 1080 },
    duration: '10s',
    anchors: {
      a: { begin: 'b.end', end: 'b.end + 1s' },
      b: { begin: 'a.end', end: 'a.end + 1s' },
    },
    tracks: [{ id: 't', kind: 'scene', src: './x.js', clips: [{ begin: '0', end: '1s', params: {} }] }],
  });
  assert.throws(() => parseSource(bad), (e) => {
    return e instanceof StageErrorException && e.err.code === 'E_ANCHOR_CYCLE';
  });
});

test('parser: invalid JSON → E_JSON_SYNTAX', () => {
  assert.throws(() => parseSource('{ not json'), (e) => {
    return e instanceof StageErrorException && e.err.code === 'E_JSON_SYNTAX';
  });
});

test('parser: schema violation (missing viewport)', () => {
  const bad = JSON.stringify({ duration: '1s', tracks: [{ id: 't', kind: 'scene', src: 's', clips: [{ begin: '0', end: '1s', params: {} }] }] });
  assert.throws(() => parseSource(bad), (e) => {
    return e instanceof StageErrorException && e.err.code === 'E_SCHEMA';
  });
});
