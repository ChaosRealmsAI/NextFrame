import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rename } from '../dist/engine-lib.js';

const baseSource = JSON.stringify({
  viewport: { ratio: '16:9', w: 1920, h: 1080 },
  duration: 'opening.end',
  anchors: {
    opening: { begin: '0', end: '0 + 3s' },
    next: { begin: 'opening.end', end: 'opening.end + 2s' },
  },
  tracks: [
    {
      id: 'scene-main',
      kind: 'scene',
      src: './scene.js',
      clips: [
        { id: 'c1', begin: 'opening.begin', end: 'opening.end', params: { layout: 'hero' } },
      ],
    },
  ],
}, null, 2);

test('rename: propagates to duration + anchor refs + clip exprs', () => {
  const { new_source, changed_locations } = rename(baseSource, 'opening', 'intro');
  assert.ok(changed_locations >= 4, 'should replace key + 3+ refs');
  assert.ok(!new_source.includes('"opening"'), 'old key gone');
  assert.ok(new_source.includes('"intro"'));
  assert.ok(new_source.includes('intro.end'));
});

test('rename: idempotent after first run', () => {
  const first = rename(baseSource, 'opening', 'intro');
  const second = rename(first.new_source, 'opening', 'intro');
  assert.equal(second.changed_locations, 0);
});

test('rename: collision target throws', () => {
  assert.throws(() => rename(baseSource, 'opening', 'next'));
});

test('rename: renaming back round-trips', () => {
  const r1 = rename(baseSource, 'opening', 'intro');
  const r2 = rename(r1.new_source, 'intro', 'opening');
  assert.equal(JSON.parse(r2.new_source).anchors.opening.begin, JSON.parse(baseSource).anchors.opening.begin);
});

test('rename: non-existent source name is noop', () => {
  const { changed_locations } = rename(baseSource, 'ghost', 'phantom');
  assert.equal(changed_locations, 0);
});

test('rename: identifier boundary — does not break "opening_extra"', () => {
  const src = JSON.stringify({
    viewport: { ratio: '16:9', w: 1920, h: 1080 },
    duration: '1s',
    anchors: {
      opening: { begin: '0', end: '1s' },
      opening_extra: { begin: 'opening.end', end: 'opening.end + 1s' },
    },
    tracks: [{ id: 't', kind: 'scene', src: './x.js', clips: [{ begin: '0', end: '1s', params: {} }] }],
  });
  const { new_source } = rename(src, 'opening', 'intro');
  assert.ok(new_source.includes('opening_extra'), 'substring match should not trigger');
  assert.ok(new_source.includes('intro.end'));
});
