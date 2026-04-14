// nextframe build <timeline.json> [-o <output.html> | --output=<output.html>]
import { parseFlags, loadTimeline, emit } from './_io.js';
import { resolveTimeline, timelineUsage } from './_resolve.js';
import { detectFormat, validateTimeline } from '../engine-v2/validate.js';
import { buildHTML } from '../engine-v2/build.js';

function extractOutput(argv) {
  // Handle -o <path> (short flag not supported by parseFlags)
  const cleaned = [];
  let outputPath = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o' && i + 1 < argv.length) {
      outputPath = argv[i + 1];
      i++; // skip next
    } else {
      cleaned.push(argv[i]);
    }
  }
  return { cleaned, outputPath };
}

export async function run(argv) {
  const { cleaned, outputPath: shortOutput } = extractOutput(argv);
  const { positional, flags } = parseFlags(cleaned);
  const resolved = resolveTimeline(positional, { usage: timelineUsage('build', '', ' -o <output.html>') });
  if (!resolved.ok) { emit(resolved, flags); return resolved.error?.code === 'USAGE' ? 3 : 2; }

  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) { emit(loaded, flags); return 2; }

  const timeline = loaded.value;
  const fmt = detectFormat(timeline);
  if (fmt === 'v0.1') {
    const msg = { ok: false, error: { code: 'OLD_FORMAT', message: 'v0.1 tracks/clips format detected — build requires v0.3 layers[] format' } };
    emit(msg, flags);
    return 2;
  }

  // Validate before building
  const validation = validateTimeline(timeline);
  if (!validation.ok) {
    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: false, error: { code: 'VALIDATION_FAILED', errors: validation.errors } }, null, 2) + '\n');
    } else {
      process.stderr.write(`validation failed with ${validation.errors.length} error(s):\n`);
      for (const e of validation.errors) process.stderr.write(`  ${e.code}: ${e.message}\n`);
    }
    return 2;
  }

  const outputPath = shortOutput || flags.output || resolved.jsonPath.replace(/\.json$/, '.html');
  const result = buildHTML(timeline, outputPath);
  emit(result, flags);
  return result.ok ? 0 : 2;
}
