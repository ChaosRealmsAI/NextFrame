// End-to-end: build the demo.sample.json via the CLI entry and verify hash stability.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve as pathResolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const engineDir = pathResolve(__dirname, '..');
const repoRoot = pathResolve(engineDir, '../..');
const enginePath = join(engineDir, 'dist/engine.js');
const demoPath = pathResolve(repoRoot, 'spec/versions/v1.1/spec/demo.sample.json');

function runBuild(outPath) {
  const payload = JSON.stringify({ cmd: 'build', args: { source: demoPath, out: outPath } });
  const r = spawnSync(process.execPath, [enginePath, '--cmd', payload], {
    encoding: 'utf8',
    timeout: 30000,
  });
  return r;
}

function sha256(s) {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

test('e2e: build demo.sample.json → out.html', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nf-engine-test-'));
  const out = join(dir, 'out.html');
  const r = runBuild(out);
  if (r.status !== 0) {
    console.error('stderr:', r.stderr);
    console.error('stdout:', r.stdout);
  }
  assert.equal(r.status, 0, 'exit 0');
  const lines = r.stdout.trim().split('\n');
  const last = JSON.parse(lines[lines.length - 1]);
  assert.equal(last.event, 'build.done');
  assert.ok(last.bytes > 0);
  const html = readFileSync(out, 'utf8');
  assert.match(html, /<div id="nf-stage">/);
  assert.match(html, /<script id="nf-resolved"/);
  assert.match(html, /<script id="nf-runtime">/);
});

test('e2e: same source built twice → byte-identical', () => {
  const dir = mkdtempSync(join(tmpdir(), 'nf-engine-test-'));
  const out1 = join(dir, 'a.html');
  const out2 = join(dir, 'b.html');
  const r1 = runBuild(out1);
  const r2 = runBuild(out2);
  assert.equal(r1.status, 0);
  assert.equal(r2.status, 0);
  const h1 = sha256(readFileSync(out1, 'utf8'));
  const h2 = sha256(readFileSync(out2, 'utf8'));
  assert.equal(h1, h2, 'bundle.html must be byte-identical across runs');
});
