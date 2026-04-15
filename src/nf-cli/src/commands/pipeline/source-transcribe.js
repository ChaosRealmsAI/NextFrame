// Transcribes a source video and stores the summarized transcript in source.json.
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
// Auto-set VIDEOCUT_WHISPER_SCRIPT if not provided (nf-source needs it to find whisper_transcribe.py)
if (!process.env.VIDEOCUT_WHISPER_SCRIPT) {
    const HERE = dirname(fileURLToPath(import.meta.url));
    const repoRoot = resolve(HERE, "../../../../../");
    process.env.VIDEOCUT_WHISPER_SCRIPT = join(repoRoot, "src/nf-source/transcribe/scripts/whisper_transcribe.py");
}
import { emit } from "../_helpers/_io.js";
import { loadProjectContext, resolveRoot } from "../_helpers/_project.js";
import { assertSourceBinAvailable, fail, looksLikeSourcePath, parseSourceFlags, readJson, readSourceJson, resolveEpisodeSourceDir, resolveSourceBin, runSourceBinary, success, summarizeTranscript, writeSourceJson, } from "../_helpers/_source.js";
const LEGACY_HELP = "usage: nextframe source-transcribe <source-dir> [--model base.en] [--lang auto]";
const HELP = "usage: nextframe source-transcribe <project> <episode> --source <name> [--model base.en] [--lang auto] [--root=PATH] [--json]";
export async function run(argv) {
    const { positional, flags } = parseSourceFlags(argv, ["model", "lang", "source", "root"]);
    if (looksLikeSourcePath(positional[0])) {
        return runLegacy(positional, flags);
    }
    return runProjectMode(positional, flags);
}
async function runLegacy(positional, flags) {
    const [sourceDirArg] = positional;
    if (!sourceDirArg) {
        fail("USAGE", LEGACY_HELP);
    }
    const sourceDir = resolve(sourceDirArg);
    const model = typeof flags.model === "string" ? flags.model : "base.en";
    const lang = typeof flags.lang === "string" ? flags.lang : "auto";
    const binPath = resolveSourceBin();
    try {
        await assertSourceBinAvailable(binPath);
        const source = await readSourceJson(sourceDir);
        runSourceBinary([
            "transcribe",
            "--video",
            join(sourceDir, "source.mp4"),
            "--model",
            model,
            "--language",
            lang,
            "--out-dir",
            sourceDir,
        ], { binPath });
        const rawSentences = await readJson(join(sourceDir, "sentences.json"));
        const transcript = summarizeTranscript(rawSentences, {
            model,
            language: lang,
            previousTranscript: source.transcript,
        });
        const nextSource = { ...source, transcript };
        await writeSourceJson(sourceDir, nextSource);
        success({ ok: true, source_dir: sourceDir, transcript, source: nextSource });
        return 0;
    }
    catch (error) {
        fail("SOURCE_TRANSCRIBE_FAILED", error.message);
    }
}
async function runProjectMode(positional, flags) {
    const [projectName, episodeName] = positional;
    if (!projectName || !episodeName || !flags.source) {
        emit({ ok: false, error: { code: "USAGE", message: HELP } }, flags);
        return 3;
    }
    const model = typeof flags.model === "string" ? flags.model : "base.en";
    const lang = typeof flags.lang === "string" ? flags.lang : "auto";
    const root = resolveRoot(flags);
    let context;
    try {
        context = await loadProjectContext(root, projectName, episodeName);
    }
    catch (err) {
        emit(loadContextError(err, projectName, episodeName), flags);
        return 2;
    }
    let sourceDir;
    try {
        sourceDir = await resolveEpisodeSourceDir(context.episodePath, flags.source);
    }
    catch (err) {
        emit({ ok: false, error: { code: "SOURCE_NOT_FOUND", message: err.message } }, flags);
        return 2;
    }
    const binPath = resolveSourceBin();
    let result;
    try {
        await assertSourceBinAvailable(binPath);
        const source = await readSourceJson(sourceDir);
        runSourceBinary([
            "transcribe",
            "--video",
            join(sourceDir, "source.mp4"),
            "--model",
            model,
            "--language",
            lang,
            "--out-dir",
            sourceDir,
        ], { binPath });
        const rawSentences = await readJson(join(sourceDir, "sentences.json"));
        const transcript = summarizeTranscript(rawSentences, {
            model,
            language: lang,
            previousTranscript: source.transcript,
        });
        const nextSource = { ...source, transcript };
        await writeSourceJson(sourceDir, nextSource);
        result = { ok: true, source_dir: sourceDir, transcript, source: nextSource };
    }
    catch (err) {
        emit({ ok: false, error: { code: "SOURCE_TRANSCRIBE_FAILED", message: err.message } }, flags);
        return 2;
    }
    if (flags.json) {
        success(result);
    }
    else {
        process.stdout.write(`updated transcript for ${result.source.id}\n`);
    }
    return 0;
}
function loadContextError(err, projectName, episodeName) {
    if (err.code === "ENOENT") {
        return {
            ok: false,
            error: {
                code: "EPISODE_NOT_FOUND",
                message: `project or episode not found: ${projectName}/${episodeName}`,
            },
        };
    }
    return { ok: false, error: { code: "LOAD_FAIL", message: err.message } };
}
export default run;
