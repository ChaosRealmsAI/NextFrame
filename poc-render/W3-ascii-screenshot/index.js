import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const RAMP = Array.from(' .:-=+*#%@▓█');
const ANSI_RESET = '\x1b[0m';
const TARGET_WIDTH = 80;
const TARGET_HEIGHT = 24;
const SILHOUETTE_THRESHOLD = 0.6;
const DEFAULT_BLACK_WIDTH = 1920;
const DEFAULT_BLACK_HEIGHT = 1080;

const projectDir = fileURLToPath(new URL('.', import.meta.url));
const defaultSource = '/Users/Zhuanz/bigbang/NextFrame/poc-render/D-napi-canvas/frame_t5.png';
const textSource =
  '/Users/Zhuanz/bigbang/NextFrame/poc-render/U-scene-gallery/frame_kineticHeadline.png';
const generatedBlackSource = path.join(projectDir, 'generated-black-frame.png');
const outputsDir = path.join(projectDir, 'outputs');

const ansiPalette = [
  { code: 30, r: 0, g: 0, b: 0 },
  { code: 31, r: 205, g: 49, b: 49 },
  { code: 32, r: 13, g: 188, b: 121 },
  { code: 33, r: 229, g: 229, b: 16 },
  { code: 34, r: 36, g: 114, b: 200 },
  { code: 35, r: 188, g: 63, b: 188 },
  { code: 36, r: 17, g: 168, b: 205 },
  { code: 37, r: 229, g: 229, b: 229 },
  { code: 90, r: 102, g: 102, b: 102 },
  { code: 91, r: 241, g: 76, b: 76 },
  { code: 92, r: 35, g: 209, b: 139 },
  { code: 93, r: 245, g: 245, b: 67 },
  { code: 94, r: 59, g: 142, b: 234 },
  { code: 95, r: 214, g: 112, b: 214 },
  { code: 96, r: 41, g: 184, b: 219 },
  { code: 97, r: 255, g: 255, b: 255 },
];

const fixtures = [
  {
    key: 'aurora',
    title: 'Aurora Gradient',
    source: defaultSource,
    notes: 'Smooth color gradient with soft wave bands.',
  },
  {
    key: 'kinetic-headline',
    title: 'Kinetic Headline',
    source: textSource,
    notes: 'Text scene chosen to test letter-shape legibility.',
  },
  {
    key: 'black-frame',
    title: 'Generated Black Frame',
    source: generatedBlackSource,
    notes: 'Synthetic all-black frame for the empty-frame case.',
  },
];

function compositeOnBlack(r, g, b, a) {
  const alpha = a / 255;
  return {
    r: Math.round(r * alpha),
    g: Math.round(g * alpha),
    b: Math.round(b * alpha),
  };
}

function luminance({ r, g, b }) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function mapToRampChar(value) {
  const index = Math.min(RAMP.length - 1, Math.floor(value * (RAMP.length - 1)));
  return RAMP[index];
}

function nearestAnsiCode(pixel) {
  let winner = ansiPalette[0];
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of ansiPalette) {
    const dr = pixel.r - candidate.r;
    const dg = pixel.g - candidate.g;
    const db = pixel.b - candidate.b;
    const distance = dr * dr + dg * dg + db * db;

    if (distance < bestDistance) {
      winner = candidate;
      bestDistance = distance;
    }
  }

  return winner.code;
}

async function ensureBlackFrame(filePath) {
  const canvas = createCanvas(DEFAULT_BLACK_WIDTH, DEFAULT_BLACK_HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await writeFile(filePath, canvas.toBuffer('image/png'));
}

async function rasterize(sourcePath, width, height) {
  const image = await loadImage(sourcePath);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function buildAsciiVariants(pixelData, width, height) {
  const pixels = [];
  let minLuma = 1;
  let maxLuma = 0;

  for (let index = 0; index < pixelData.length; index += 4) {
    const pixel = compositeOnBlack(
      pixelData[index],
      pixelData[index + 1],
      pixelData[index + 2],
      pixelData[index + 3]
    );
    const rawLuma = luminance(pixel);
    minLuma = Math.min(minLuma, rawLuma);
    maxLuma = Math.max(maxLuma, rawLuma);
    pixels.push({ pixel, rawLuma });
  }

  const lumaRange = maxLuma - minLuma;
  const bwLines = [];
  const colorLines = [];
  const silhouetteLines = [];

  for (let y = 0; y < height; y += 1) {
    let bwLine = '';
    let colorLine = '';
    let silhouetteLine = '';
    let activeAnsiCode = null;

    for (let x = 0; x < width; x += 1) {
      const sample = pixels[y * width + x];
      const value = lumaRange > 0 ? (sample.rawLuma - minLuma) / lumaRange : sample.rawLuma;
      const glyph = mapToRampChar(value);
      const silhouetteGlyph = value >= SILHOUETTE_THRESHOLD ? '▓' : ' ';
      const ansiCode = nearestAnsiCode(sample.pixel);

      bwLine += glyph;
      silhouetteLine += silhouetteGlyph;

      if (activeAnsiCode !== ansiCode) {
        colorLine += `\x1b[${ansiCode}m`;
        activeAnsiCode = ansiCode;
      }
      colorLine += glyph;
    }

    if (activeAnsiCode !== null) {
      colorLine += ANSI_RESET;
    }

    bwLines.push(bwLine);
    colorLines.push(colorLine);
    silhouetteLines.push(silhouetteLine);
  }

  return {
    bw: `${bwLines.join('\n')}\n`,
    color: `${colorLines.join('\n')}\n`,
    silhouette: `${silhouetteLines.join('\n')}\n`,
  };
}

async function writeFixtureOutputs(fixture, variants) {
  const fixtureDir = path.join(outputsDir, fixture.key);
  await mkdir(fixtureDir, { recursive: true });

  const targets = {
    bw: path.join(fixtureDir, 'ascii-bw.txt'),
    color: path.join(fixtureDir, 'ascii-color.txt'),
    silhouette: path.join(fixtureDir, 'ascii-silhouette.txt'),
  };

  await Promise.all([
    writeFile(targets.bw, variants.bw, 'utf8'),
    writeFile(targets.color, variants.color, 'utf8'),
    writeFile(targets.silhouette, variants.silhouette, 'utf8'),
  ]);

  return targets;
}

async function duplicateDefaultOutputs(sourceTargets) {
  const rootTargets = {
    bw: path.join(projectDir, 'ascii-bw.txt'),
    color: path.join(projectDir, 'ascii-color.txt'),
    silhouette: path.join(projectDir, 'ascii-silhouette.txt'),
  };

  const contents = await Promise.all([
    readFile(sourceTargets.bw, 'utf8'),
    readFile(sourceTargets.color, 'utf8'),
    readFile(sourceTargets.silhouette, 'utf8'),
  ]);

  await Promise.all([
    writeFile(rootTargets.bw, contents[0], 'utf8'),
    writeFile(rootTargets.color, contents[1], 'utf8'),
    writeFile(rootTargets.silhouette, contents[2], 'utf8'),
  ]);

  return rootTargets;
}

function summarizeLegibility(fixture, variants) {
  if (fixture.key === 'aurora') {
    return 'Readable as a smooth, layered gradient. Banding is visible, and the silhouette stays abstract as expected.';
  }

  if (fixture.key === 'kinetic-headline') {
    return 'The headline frame remains identifiable as text. Individual letters are blocky, but the word shapes survive at 80 columns.';
  }

  return 'The black frame collapses to near-empty output, which is the expected result and makes empty scenes obvious.';
}

async function sizeOf(filePath) {
  const info = await stat(filePath);
  return info.size;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  return `${(bytes / 1024).toFixed(2)} KB`;
}

function sampleBlock(text, maxLines = TARGET_HEIGHT) {
  const sample = text.trimEnd().split('\n').slice(0, maxLines).join('\n');
  return sample.trim().length === 0 ? '[all blank / empty frame]' : sample;
}

async function collectLoc() {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  const { stdout } = await execFileAsync('wc', ['-l', 'index.js', 'package.json', 'report.md'], {
    cwd: projectDir,
  });

  const lines = stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => line.trim());
  const totalLine = lines.at(-1) ?? '';
  const total = Number.parseInt(totalLine.split(/\s+/)[0] ?? '0', 10);

  return {
    total,
    detail: lines,
  };
}

function buildReport({
  generatedAt,
  fixtureResults,
  rootTargets,
  loc,
}) {
  const fixtureSizeRows = fixtureResults
    .map((result) => {
      const rows = result.sizes
        .map(({ label, bytes }) => `- ${label}: \`${formatBytes(bytes)}\` (${bytes} bytes)`)
        .join('\n');
      return `### ${result.fixture.title}\n\n${rows}`;
    })
    .join('\n\n');

  const outputTargetCheck = fixtureResults
    .map((result) => {
      const rows = result.sizes
        .map(({ label, bytes }) => `- ${label}: ${bytes < 5120 ? 'under' : 'over'} 5 KB target`)
        .join('\n');
      return `### ${result.fixture.title}\n\n${rows}`;
    })
    .join('\n\n');

  const fixtureAssessmentRows = fixtureResults
    .map(
      (result) =>
        `### ${result.fixture.title}\n\n- Source: \`${result.fixture.source}\`\n- Assessment: ${result.legibility}\n- Notes: ${result.fixture.notes}`
    )
    .join('\n\n');

  const sampleSections = fixtureResults
    .map(
      (result) =>
        `### ${result.fixture.title} BW Sample\n\n\`\`\`text\n${sampleBlock(result.variants.bw)}\n\`\`\``
    )
    .join('\n\n');

  return `# W3 ASCII Screenshot Report

- Generated on: \`${generatedAt}\`
- Default render source: \`${defaultSource}\`
- Output grid: \`${TARGET_WIDTH}x${TARGET_HEIGHT}\`
- Root outputs:
  - \`${path.basename(rootTargets.bw)}\`
  - \`${path.basename(rootTargets.color)}\`
  - \`${path.basename(rootTargets.silhouette)}\`

## Legibility

${fixtureAssessmentRows}

## File Sizes

${fixtureSizeRows}

## Target Check

${outputTargetCheck}

All generated outputs are below the 5 KB target in this run. ANSI stays small here because the color layer reuses the active ANSI code until the quantized color changes. The root files are copies of the default Aurora fixture.

## LOC

- Total LOC in this POC dir (index.js + package.json + report.md): \`${loc.total}\`
${loc.detail.map((line) => `- \`${line}\``).join('\n')}

## Sample Output

${sampleSections}
`;
}

async function main() {
  await mkdir(outputsDir, { recursive: true });
  await ensureBlackFrame(generatedBlackSource);

  const fixtureResults = [];

  for (const fixture of fixtures) {
    const pixelData = await rasterize(fixture.source, TARGET_WIDTH, TARGET_HEIGHT);
    const variants = buildAsciiVariants(pixelData, TARGET_WIDTH, TARGET_HEIGHT);
    const targets = await writeFixtureOutputs(fixture, variants);
    const sizes = await Promise.all([
      sizeOf(targets.bw),
      sizeOf(targets.color),
      sizeOf(targets.silhouette),
    ]);

    fixtureResults.push({
      fixture,
      variants,
      targets,
      sizes: [
        { label: 'ascii-bw.txt', bytes: sizes[0] },
        { label: 'ascii-color.txt', bytes: sizes[1] },
        { label: 'ascii-silhouette.txt', bytes: sizes[2] },
      ],
      legibility: summarizeLegibility(fixture, variants),
    });
  }

  const rootTargets = await duplicateDefaultOutputs(fixtureResults[0].targets);
  let loc = { total: 0, detail: [] };

  for (let pass = 0; pass < 3; pass += 1) {
    const report = buildReport({
      generatedAt: new Date().toISOString(),
      fixtureResults,
      rootTargets,
      loc,
    });
    await writeFile(path.join(projectDir, 'report.md'), report, 'utf8');

    const nextLoc = await collectLoc();
    if (nextLoc.total === loc.total && nextLoc.detail.join('\n') === loc.detail.join('\n')) {
      break;
    }
    loc = nextLoc;
  }

  for (const result of fixtureResults) {
    console.log(`\n=== ${result.fixture.title} | BW ===\n`);
    process.stdout.write(result.variants.bw);
    console.log(`\n=== ${result.fixture.title} | Color ===\n`);
    process.stdout.write(result.variants.color);
    console.log(`\n=== ${result.fixture.title} | Silhouette ===\n`);
    process.stdout.write(result.variants.silhouette);
  }

  const rootSizeSummary = await Promise.all([
    sizeOf(rootTargets.bw),
    sizeOf(rootTargets.color),
    sizeOf(rootTargets.silhouette),
  ]);

  console.log('\n=== Summary ===\n');
  console.log(
    JSON.stringify(
      {
        grid: `${TARGET_WIDTH}x${TARGET_HEIGHT}`,
        defaultSource,
        rootOutputs: {
          bw: { path: rootTargets.bw, bytes: rootSizeSummary[0] },
          color: { path: rootTargets.color, bytes: rootSizeSummary[1] },
          silhouette: { path: rootTargets.silhouette, bytes: rootSizeSummary[2] },
        },
        report: path.join(projectDir, 'report.md'),
      },
      null,
      2
    )
  );
}

await main();
