import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { bundle } from '../dist/engine-lib.js';

function sha256(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

const baseResolved = {
  viewport: { ratio: '16:9', w: 1920, h: 1080 },
  duration_ms: 10000,
  anchors: { a: { kind: 'range', begin_ms: 0, end_ms: 10000 } },
  tracks: [
    { id: 'scene-main', kind: 'scene', src: './scene.js', clips: [{ id: 'c1', trackId: 'scene-main', begin_ms: 0, end_ms: 3000, params: { layout: 'hero' } }] }
  ],
};

test('bundler: required tags present', () => {
  const html = bundle({ resolved: baseResolved, trackSources: { 'scene-main': 'export function render(){return "x"}' }, runtimeJs: '// rt' });
  assert.match(html, /<!DOCTYPE html>/);
  assert.match(html, /<div id="nf-stage">/);
  assert.match(html, /<script id="nf-resolved" type="application\/json">/);
  assert.match(html, /<script id="nf-tracks" type="application\/json">/);
  assert.match(html, /<script id="nf-runtime">/);
});

test('bundler: v1.2 three-layer DOM (stage-wrap / controls / timeline)', () => {
  const html = bundle({ resolved: baseResolved, trackSources: { 'scene-main': '// s' }, runtimeJs: '// rt' });
  assert.match(html, /<div class="stage-wrap">/);
  assert.match(html, /<div class="controls">/);
  assert.match(html, /<div class="timeline">/);
  assert.match(html, /<div class="ruler"><\/div>/);
  assert.match(html, /<div class="tracks">/);
  assert.match(html, /<div class="playhead">/);
  assert.match(html, /<div class="ph-triangle"><\/div>/);
  assert.match(html, /<div class="ph-line"><\/div>/);
  assert.match(html, /<div class="ph-label">/);
});

test('bundler: v1.2 five control buttons with data-nf attrs', () => {
  const html = bundle({ resolved: baseResolved, trackSources: { 'scene-main': '// s' }, runtimeJs: '// rt' });
  for (const key of ['to-start', 'prev-frame', 'play-pause', 'next-frame', 'to-end', 'loop-toggle']) {
    assert.match(html, new RegExp(`data-nf="${key}"`), `button data-nf="${key}" missing`);
  }
  assert.match(html, /data-nf="loop-toggle" data-active="false"/);
  assert.match(html, /<span class="timecode">/);
  assert.match(html, /<span class="now">00:00\.000<\/span>/);
});

test('bundler: v1.2 CSS hard-rule comments inlined (ADR-036 markers)', () => {
  const html = bundle({ resolved: baseResolved, trackSources: { 'scene-main': '// s' }, runtimeJs: '// rt' });
  const hits = html.match(/NO OVERFLOW: ADR-036/g) ?? [];
  assert.ok(hits.length >= 3, `expected >=3 ADR-036 markers, got ${hits.length}`);
});

test('bundler: missing track source throws', () => {
  assert.throws(
    () => bundle({ resolved: baseResolved, trackSources: {}, runtimeJs: '// rt' }),
    /E_TRACK_SRC_MISSING|track source not provided/,
  );
});

test('bundler: idempotent — same input → identical bytes', () => {
  const input = {
    resolved: baseResolved,
    trackSources: { 'scene-main': 'export function render(t){return String(t)}' },
    runtimeJs: '/* runtime v1 */',
  };
  const h1 = bundle(input);
  const h2 = bundle(input);
  assert.equal(sha256(h1), sha256(h2));
  assert.equal(h1, h2);
});

test('bundler: stable under key reordering', () => {
  const input1 = {
    resolved: baseResolved,
    trackSources: { 'scene-main': 'a', 'other': 'b' },
    runtimeJs: '/* rt */',
  };
  const resolved2 = { ...baseResolved, tracks: [...baseResolved.tracks, { id: 'other', kind: 'scene', src: './o.js', clips: [{ id: 'o1', trackId: 'other', begin_ms: 0, end_ms: 1000, params: { layout: 'hero' } }] }] };
  const input2 = {
    resolved: resolved2,
    trackSources: { 'other': 'b', 'scene-main': 'a' },
    runtimeJs: '/* rt */',
  };
  const input3 = {
    resolved: resolved2,
    trackSources: { 'scene-main': 'a', 'other': 'b' },
    runtimeJs: '/* rt */',
  };
  assert.equal(sha256(bundle(input2)), sha256(bundle(input3)));
});

test('bundler: script-terminator escape', () => {
  const evil = '</script><script>alert(1)</script>';
  const html = bundle({
    resolved: { ...baseResolved, meta: { payload: evil } },
    trackSources: { 'scene-main': 'x' },
    runtimeJs: '// rt',
  });
  // Raw '</script' must not appear inside the JSON script blocks.
  const jsonBlock = html.match(/<script id="nf-resolved"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(jsonBlock);
  assert.ok(!jsonBlock[1].includes('</script'), 'JSON block must not contain raw </script');
});
