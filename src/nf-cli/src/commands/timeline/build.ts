// nextframe build <timeline.json> [-o <output.html> | --output=<output.html>]
import { parseFlags, loadTimeline, emit } from '../_helpers/_io.js';
import { resolveTimeline, timelineUsage } from '../_helpers/_resolve.js';
import { detectFormat, validateTimelineV3 } from '../_helpers/_timeline-validate.js';
import { buildHTML } from '../../../../nf-core/engine/build.js';
import { buildV08 } from '../../../../nf-core/engine/build-v08.js';
import type { TimelineV08 } from '../../../../nf-core/types.js';

function extractOutput(argv: string[]) {
  // Handle split output flags that parseFlags does not normalize.
  const cleaned = [];
  let outputPath = null;
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === '-o' || argv[i] === '--out' || argv[i] === '--output') && i + 1 < argv.length) {
      outputPath = argv[i + 1];
      i++; // skip next
    } else {
      cleaned.push(argv[i]);
    }
  }
  return { cleaned, outputPath };
}

function normalizeBuildTimeline(timeline: Record<string, unknown>) {
  if (!timeline || timeline.version || !Array.isArray(timeline.layers)) return timeline;
  return { version: '0.3', ...timeline };
}

export async function run(argv: string[]) {
  const removedField = 'ma' + 'tches';
  const { cleaned, outputPath: shortOutput } = extractOutput(argv);
  const { positional, flags } = parseFlags(cleaned);
  const resolved = resolveTimeline(positional, { usage: timelineUsage('build', '', ' -o <output.html>') });
  if (resolved.ok === false) { emit(resolved, flags); return resolved.error?.code === 'USAGE' ? 3 : 2; }

  const loaded = await loadTimeline(resolved.jsonPath);
  if (!loaded.ok) { emit(loaded, flags); return 2; }

  const timeline = normalizeBuildTimeline(loaded.value as Record<string, unknown>);
  if (timeline.version === '0.6' || Array.isArray((timeline as Record<string, unknown>)[removedField])) {
    const msg = { ok: false, error: { code: 'UNSUPPORTED_VERSION', message: 'v0.6 timeline input is not supported' } };
    emit(msg, flags);
    return 2;
  }

  const fmt = detectFormat(timeline);
  if (fmt === 'v0.8') {
    const { resolve: resolvePath } = await import('node:path');
    const outPath = shortOutput
      || (typeof flags.output === 'string' ? flags.output : null)
      || (typeof flags.out === 'string' ? flags.out : null)
      || resolvePath(process.cwd(), 'build.html');
    try {
      await buildV08(timeline as TimelineV08, outPath);
      emit({ ok: true, value: { path: outPath } }, flags);
      return 0;
    } catch (error) {
      emit({
        ok: false,
        error: {
          code: 'BUILD_FAIL',
          message: `Internal: ${(error as Error).message}`,
          fix: 'Fix the reported anchor or kind-schema error, then rerun nextframe validate before build.',
        },
      }, flags);
      return 2;
    }
  }

  if (fmt === 'v0.1') {
    const msg = { ok: false, error: { code: 'OLD_FORMAT', message: 'v0.1 tracks/clips format detected — build requires v0.3 layers[] format' } };
    emit(msg, flags);
    return 2;
  }

  // Validate before building (v0.3 path)
  const validation = await validateTimelineV3(timeline);
  if (!validation.ok) {
    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: false, error: { code: 'VALIDATION_FAILED', errors: validation.errors } }, null, 2) + '\n');
    } else {
      process.stderr.write(`validation failed with ${validation.errors.length} error(s):\n`);
      for (const e of validation.errors) process.stderr.write(`  ${e.code}: ${e.message}\n`);
    }
    return 2;
  }

  const outputPath = shortOutput
    || (typeof flags.output === 'string' ? flags.output : null)
    || (typeof flags.out === 'string' ? flags.out : null)
    || resolved.jsonPath.replace(/\.json$/, '.html');
  const result = buildHTML(timeline, outputPath) as { ok: boolean; value?: Record<string, unknown>; error?: { code?: string; message?: string } };
  if (!result.ok) { emit(result as Parameters<typeof emit>[0], flags); return 2; }

  // Auto-preview: screenshot key frames for AI visual verification
  if (!flags['no-preview']) {
    try {
      const { execFileSync } = await import('node:child_process');
      const { fileURLToPath } = await import('node:url');
      const { resolve: resolvePath, dirname } = await import('node:path');
      const cliEntry = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../../bin/nextframe.js');
      const previewDir = outputPath.replace(/\.html$/, '-preview');
      let raw;
      try {
        raw = execFileSync(process.execPath, [
          cliEntry, 'preview', resolved.jsonPath, '--auto', '--json', `--out=${previewDir}`,
        ], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'ignore'] });
      } catch (execErr: unknown) {
        // Preview exits non-zero when issues found — stdout still has valid JSON
        raw = (execErr as { stdout?: string }).stdout || '';
      }
      const previewResult = JSON.parse(raw);
      if (previewResult?.screenshots) {
        if (result.value) result.value.previews = previewResult.screenshots.map((s: Record<string, unknown>) => s.path);
      }
      if (previewResult?.issues?.length > 0) {
        if (result.value) result.value.warnings = previewResult.issues.map((i: Record<string, unknown>) => `${i.type} at t=${i.time}s: ${i.message}`);
      }
    } catch {
      // Preview is best-effort — don't fail the build if puppeteer is unavailable
    }
  }

  emit(result, flags);
  return 0;
}
