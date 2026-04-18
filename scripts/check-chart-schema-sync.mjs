#!/usr/bin/env node
// scripts/check-chart-schema-sync.mjs
// VP-2 verify: chart.js describe().params is byte-equal to spec/interfaces.json chart.params_schema
// FM-SHAPE gate · schema single source of truth
//
// Usage:  node scripts/check-chart-schema-sync.mjs [--quiet]
// Exit:   0 = PASS (byte-equal)  ·  1 = FAIL
// Output: JSON report to stdout

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('check-chart-schema-sync.mjs — VP-2 (FM-SHAPE): compare chart.js describe().params to spec/interfaces.json chart.params_schema byte-equal');
  console.log('Usage: node scripts/check-chart-schema-sync.mjs [--quiet]');
  process.exit(0);
}
const QUIET = args.includes('--quiet');

function canonicalize(o) {
  if (Array.isArray(o)) return o.map(canonicalize);
  if (o !== null && typeof o === 'object') {
    const r = {};
    for (const k of Object.keys(o).sort()) r[k] = canonicalize(o[k]);
    return r;
  }
  return o;
}

function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }

async function main() {
  const ifsPath = path.join(REPO, 'spec/interfaces.json');
  const chartPath = path.join(REPO, 'src/nf-tracks/official/chart.js');

  if (!fs.existsSync(ifsPath)) {
    console.error(JSON.stringify({ event: 'error', reason: 'spec/interfaces.json not found' }));
    process.exit(2);
  }
  if (!fs.existsSync(chartPath)) {
    console.error(JSON.stringify({ event: 'error', reason: 'src/nf-tracks/official/chart.js not found (T-01 not done?)' }));
    process.exit(2);
  }

  const ifs = JSON.parse(fs.readFileSync(ifsPath, 'utf8'));
  const mod = ifs.modules.find(m => m.id === 'nf-tracks');
  if (!mod || !mod.kinds || !mod.kinds.chart) {
    console.error(JSON.stringify({ event: 'error', reason: 'interfaces.json missing nf-tracks.kinds.chart' }));
    process.exit(2);
  }
  const fromIfs = mod.kinds.chart.params_schema;
  if (!fromIfs) {
    console.error(JSON.stringify({ event: 'error', reason: 'interfaces.json missing chart.params_schema' }));
    process.exit(2);
  }

  const chartMod = await import('file://' + chartPath);
  if (typeof chartMod.describe !== 'function') {
    console.error(JSON.stringify({ event: 'error', reason: 'chart.js missing describe() export' }));
    process.exit(2);
  }
  const desc = chartMod.describe();
  const fromChart = desc.params;
  if (!fromChart) {
    console.error(JSON.stringify({ event: 'error', reason: 'describe().params is undefined' }));
    process.exit(2);
  }

  const a = JSON.stringify(canonicalize(fromIfs));
  const b = JSON.stringify(canonicalize(fromChart));
  const hashA = md5(a);
  const hashB = md5(b);
  const pass = hashA === hashB;

  const report = {
    event: pass ? 'schema-sync.pass' : 'schema-sync.fail',
    vp: 'VP-2',
    pass,
    from_interfaces_hash: hashA,
    from_chart_hash: hashB,
    interfaces_size_bytes: a.length,
    chart_size_bytes: b.length,
    delta_bytes: Math.abs(a.length - b.length),
  };

  if (!pass) {
    // show first divergence hint
    const hint = [];
    const ifsKeys = Object.keys(canonicalize(fromIfs.properties || {})).sort();
    const chartKeys = Object.keys(canonicalize(fromChart.properties || {})).sort();
    if (JSON.stringify(ifsKeys) !== JSON.stringify(chartKeys)) {
      hint.push('properties keys differ');
      hint.push('interfaces: ' + ifsKeys.join(','));
      hint.push('chart.js:  ' + chartKeys.join(','));
    }
    report.divergence_hint = hint;
  }

  if (!QUIET) console.log(JSON.stringify(report, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch(e => {
  console.error(JSON.stringify({ event: 'error', message: e.message, stack: e.stack }));
  process.exit(2);
});
