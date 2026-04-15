// nextframe build <timeline.json> [-o <output.html> | --output=<output.html>]
import { parseFlags, loadTimeline, emit } from '../_helpers/_io.js';
import { resolveTimeline, timelineUsage } from '../_helpers/_resolve.js';
import { detectFormat, validateTimelineV3 } from '../_helpers/_timeline-validate.js';
import { buildHTML } from 'nf-core/engine/build.js';
function extractOutput(argv) {
    // Handle -o <path> (short flag not supported by parseFlags)
    const cleaned = [];
    let outputPath = null;
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '-o' && i + 1 < argv.length) {
            outputPath = argv[i + 1];
            i++; // skip next
        }
        else {
            cleaned.push(argv[i]);
        }
    }
    return { cleaned, outputPath };
}
function normalizeBuildTimeline(timeline) {
    if (!timeline || timeline.version || !Array.isArray(timeline.layers))
        return timeline;
    return { version: '0.3', ...timeline };
}
export async function run(argv) {
    const { cleaned, outputPath: shortOutput } = extractOutput(argv);
    const { positional, flags } = parseFlags(cleaned);
    const resolved = resolveTimeline(positional, { usage: timelineUsage('build', '', ' -o <output.html>') });
    if (resolved.ok === false) {
        emit(resolved, flags);
        return resolved.error?.code === 'USAGE' ? 3 : 2;
    }
    const loaded = await loadTimeline(resolved.jsonPath);
    if (!loaded.ok) {
        emit(loaded, flags);
        return 2;
    }
    const timeline = normalizeBuildTimeline(loaded.value);
    const fmt = detectFormat(timeline);
    if (fmt === 'v0.1') {
        const msg = { ok: false, error: { code: 'OLD_FORMAT', message: 'v0.1 tracks/clips format detected — build requires v0.3 layers[] format' } };
        emit(msg, flags);
        return 2;
    }
    // Validate before building
    const validation = await validateTimelineV3(timeline);
    if (!validation.ok) {
        if (flags.json) {
            process.stdout.write(JSON.stringify({ ok: false, error: { code: 'VALIDATION_FAILED', errors: validation.errors } }, null, 2) + '\n');
        }
        else {
            process.stderr.write(`validation failed with ${validation.errors.length} error(s):\n`);
            for (const e of validation.errors)
                process.stderr.write(`  ${e.code}: ${e.message}\n`);
        }
        return 2;
    }
    const outputPath = shortOutput || (typeof flags.output === 'string' ? flags.output : null) || resolved.jsonPath.replace(/\.json$/, '.html');
    const result = buildHTML(timeline, outputPath);
    if (!result.ok) {
        emit(result, flags);
        return 2;
    }
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
            }
            catch (execErr) {
                // Preview exits non-zero when issues found — stdout still has valid JSON
                raw = execErr.stdout || '';
            }
            const previewResult = JSON.parse(raw);
            if (previewResult?.screenshots) {
                if (result.value)
                    result.value.previews = previewResult.screenshots.map((s) => s.path);
            }
            if (previewResult?.issues?.length > 0) {
                if (result.value)
                    result.value.warnings = previewResult.issues.map((i) => `${i.type} at t=${i.time}s: ${i.message}`);
            }
        }
        catch {
            // Preview is best-effort — don't fail the build if puppeteer is unavailable
        }
    }
    emit(result, flags);
    return 0;
}
