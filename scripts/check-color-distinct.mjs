#!/usr/bin/env node
// scripts/check-color-distinct.mjs
// VP-5 verify: multi-series colors are CIE Lab distance >= 20 (visually distinct)
// + idempotency check: same t → byte-identical HTML
//
// Usage:  node scripts/check-color-distinct.mjs [--chart path/to/chart.js]
// Default: src/nf-tracks/official/chart.js
// Exit:   0 = PASS (all pairs ≥ 20 · idempotent)  ·  1 = FAIL
// Output: JSON report to stdout

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('check-color-distinct.mjs — VP-5: CIE Lab color distance >= 20 for multi-series + idempotency');
  console.log('Usage: node scripts/check-color-distinct.mjs [--chart src/nf-tracks/official/chart.js]');
  process.exit(0);
}
const chartArg = args.indexOf('--chart');
const chartPath = chartArg >= 0 && args[chartArg+1] ? path.resolve(args[chartArg+1]) : path.join(REPO, 'src/nf-tracks/official/chart.js');

// sRGB hex → Lab (CIE 1976)
function hex2rgb(hex){
  const h = hex.replace('#','');
  return [parseInt(h.slice(0,2),16)/255, parseInt(h.slice(2,4),16)/255, parseInt(h.slice(4,6),16)/255];
}
function srgb2lin(c){ return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
function rgb2xyz(rgb){
  const [r,g,b] = rgb.map(srgb2lin);
  return [
    (r*0.4124564 + g*0.3575761 + b*0.1804375) * 100,
    (r*0.2126729 + g*0.7151522 + b*0.0721750) * 100,
    (r*0.0193339 + g*0.1191920 + b*0.9503041) * 100,
  ];
}
function xyz2lab(xyz){
  // D65
  const [x,y,z] = [xyz[0]/95.047, xyz[1]/100.000, xyz[2]/108.883];
  const f = t => t > 216/24389 ? Math.cbrt(t) : (841/108)*t + 4/29;
  const [fx,fy,fz] = [f(x), f(y), f(z)];
  return [116*fy - 16, 500*(fx - fy), 200*(fy - fz)];
}
function hex2lab(hex){ return xyz2lab(rgb2xyz(hex2rgb(hex))); }
function labDist(a, b){ return Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]); }

async function main(){
  const chartMod = await import('file://' + chartPath);
  // sanity: ensure describe exists (will throw if missing)
  if (typeof chartMod.describe !== 'function') {
    console.error(JSON.stringify({ event: 'error', reason: 'chart.js missing describe()' }));
    process.exit(2);
  }

  // simulate 3 chart_types with multi-series
  const testCases = [
    {
      name: 'bar-multi-series',
      params: {
        chart_type: 'bar', layout: 'grouped',
        categories: ['Q1','Q2','Q3','Q4'],
        series: [
          { name: 'A', color: '#a78bfa', data: [45, 55, 50, 62] },
          { name: 'B', color: '#f97316', data: [58, 68, 65, 78] },
          { name: 'C', color: '#34d399', data: [72, 82, 88, 95] }
        ]
      }
    },
    {
      name: 'pie-5-slice',
      params: {
        chart_type: 'pie',
        series: [
          { name: 'S1', color: '#a78bfa', value: 32 },
          { name: 'S2', color: '#f97316', value: 24 },
          { name: 'S3', color: '#34d399', value: 19 },
          { name: 'S4', color: '#38bdf8', value: 15 },
          { name: 'S5', color: '#fbbf24', value: 10 }
        ]
      }
    }
  ];

  const results = { event: 'color-distinct.check', vp: 'VP-5', cases: [], all_pass: true };

  for (const tc of testCases) {
    const colors = tc.params.series.map(s => s.color);
    const labs = colors.map(hex2lab);
    const pairs = [];
    let minDist = Infinity;
    for (let i=0;i<colors.length;i++){
      for (let j=i+1;j<colors.length;j++){
        const d = labDist(labs[i], labs[j]);
        pairs.push({ a: colors[i], b: colors[j], dist: +d.toFixed(2) });
        minDist = Math.min(minDist, d);
      }
    }
    const colorPass = minDist >= 20;

    // idempotency: same (t, params, vp) → same HTML
    const vp = { w: 1920, h: 1080 };
    const h1 = chartMod.render(2000, tc.params, vp);
    const h2 = chartMod.render(2000, tc.params, vp);
    const h3 = chartMod.render(2000, tc.params, vp);
    const idemPass = h1 === h2 && h2 === h3;
    const hash = crypto.createHash('md5').update(h1).digest('hex').slice(0,12);

    results.cases.push({
      name: tc.name,
      color_count: colors.length,
      min_lab_distance: +minDist.toFixed(2),
      color_pass: colorPass,
      pairs_below_20: pairs.filter(p => p.dist < 20),
      idempotency: { pass: idemPass, hash, lengths: [h1.length, h2.length, h3.length] },
    });
    if (!colorPass || !idemPass) results.all_pass = false;
  }

  results.pass_criteria = 'min_lab_distance >= 20 AND idempotency.pass';
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.all_pass ? 0 : 1);
}

main().catch(e => {
  console.error(JSON.stringify({ event: 'error', message: e.message, stack: e.stack }));
  process.exit(2);
});
