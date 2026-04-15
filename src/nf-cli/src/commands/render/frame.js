// nextframe frame <timeline.json> <t> <out.png>
import { mkdir, writeFile } from "node:fs/promises";
import { parseFlags, loadTimeline, emit, parseTime } from "../_helpers/_io.js";
import { configureProjectCacheEnv, resolveTimeline, segmentFramePath, timelineUsage } from "../_helpers/_resolve.js";
import { renderFramePNG } from "../../targets/napi-canvas.js";
const USAGE = timelineUsage("frame", " <t>", " <t> <out.png>");
export async function run(argv) {
    const { positional, flags } = parseFlags(argv);
    const resolved = resolveTimeline(positional, { usage: USAGE });
    if (resolved.ok === false) {
        const code = resolved.error.code;
        emit(resolved, flags);
        return code === "USAGE" ? 3 : 2;
    }
    const [tSpec, explicitOutPath] = resolved.rest;
    if (tSpec === undefined || (resolved.legacy === false && explicitOutPath !== undefined)) {
        emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
        return 3;
    }
    const t = parseTime(tSpec);
    if (!Number.isFinite(t)) {
        emit({ ok: false, error: { code: "BAD_TIME", message: `cannot parse time "${tSpec}"` } }, flags);
        return 3;
    }
    const outPath = resolved.legacy === false
        ? segmentFramePath(resolved.segment, resolved.framesPath, t)
        : explicitOutPath;
    if (!outPath) {
        emit({ ok: false, error: { code: "USAGE", message: USAGE } }, flags);
        return 3;
    }
    const restoreCacheEnv = resolved.legacy === false ? configureProjectCacheEnv(resolved.cachePath) : () => { };
    try {
        const loaded = await loadTimeline(resolved.jsonPath);
        if (!loaded.ok) {
            emit(loaded, flags);
            return 2;
        }
        const opts = {};
        if (flags.width)
            opts.width = Number(flags.width);
        if (flags.height)
            opts.height = Number(flags.height);
        const r = renderFramePNG(loaded.value, t, opts);
        if (!r.ok) {
            emit(r, flags);
            return 2;
        }
        const framesPath = resolved.legacy === false ? resolved.framesPath : undefined;
        if (framesPath) {
            await mkdir(framesPath, { recursive: true });
        }
        await writeFile(outPath, r.value);
        if (flags.json) {
            process.stdout.write(JSON.stringify({ ok: true, value: { path: outPath, bytes: r.value.length, t } }, null, 2) + "\n");
        }
        else {
            process.stdout.write(`wrote ${outPath} (${r.value.length} bytes)\n`);
        }
        return 0;
    }
    finally {
        restoreCacheEnv();
    }
}
