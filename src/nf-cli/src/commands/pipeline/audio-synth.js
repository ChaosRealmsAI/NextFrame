// Synthesizes TTS audio for one pipeline script segment and registers the output in pipeline.json.
import { execFileSync } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFlags, emit } from "../_helpers/_io.js";
import { loadPipeline, savePipeline } from "../_helpers/_pipeline.js";
import { parseIntegerFlag } from "../_helpers/_pipeline-utils.js";
import { resolveRoot, loadProjectContext } from "../_helpers/_project.js";
const HELP = "usage: nextframe audio-synth <project> <episode> --segment=N [--voice=NAME] [--backend=edge|volcengine] [--root=PATH] [--json]";
const ALLOWED_BACKENDS = new Set(["edge", "volcengine"]);
export async function run(argv) {
    const { positional, flags } = parseFlags(argv);
    const [projectName, episodeName] = positional;
    if (!projectName || !episodeName || flags.segment === undefined) {
        emit({ ok: false, error: { code: "USAGE", message: HELP } }, flags);
        return 3;
    }
    const parsedSegment = parseIntegerFlag("segment", flags.segment, { min: 1 });
    if (!parsedSegment.ok) {
        emit(parsedSegment, flags);
        return 3;
    }
    const segmentNumber = parsedSegment.value;
    if (flags.voice === true) {
        emit(invalidFlag("voice", flags.voice, "must be a string"), flags);
        return 3;
    }
    const voice = typeof flags.voice === "string" ? flags.voice.trim() : undefined;
    if (flags.backend === true) {
        emit(invalidFlag("backend", flags.backend, "must be edge or volcengine"), flags);
        return 3;
    }
    const backend = typeof flags.backend === "string" ? flags.backend.trim() : undefined;
    if (backend && !ALLOWED_BACKENDS.has(backend)) {
        emit(invalidFlag("backend", backend, "must be edge or volcengine"), flags);
        return 3;
    }
    const root = resolveRoot(flags);
    let context;
    try {
        context = await loadProjectContext(root, projectName, episodeName);
    }
    catch (err) {
        emit(loadContextError(err, projectName, episodeName), flags);
        return 2;
    }
    let pipeline;
    try {
        pipeline = await loadPipeline(context.projectPath, episodeName);
    }
    catch (err) {
        emit({ ok: false, error: { code: "LOAD_FAIL", message: err.message } }, flags);
        return 2;
    }
    const scriptSegment = Array.isArray(pipeline.script?.segments)
        ? pipeline.script.segments[segmentNumber - 1]
        : undefined;
    if (!scriptSegment) {
        emit({
            ok: false,
            error: {
                code: "SEGMENT_NOT_FOUND",
                message: `script segment ${segmentNumber} not found in ${projectName}/${episodeName}`,
                fix: `run nextframe script-set ${projectName} ${episodeName} --segment=${segmentNumber} --narration=TEXT first`,
            },
        }, flags);
        return 3;
    }
    const narration = typeof scriptSegment.narration === "string" ? scriptSegment.narration.trim() : "";
    if (!narration) {
        emit({
            ok: false,
            error: {
                code: "NARRATION_MISSING",
                message: `script segment ${segmentNumber} has no narration text`,
                fix: `run nextframe script-set ${projectName} ${episodeName} --segment=${segmentNumber} --narration=TEXT first`,
            },
        }, flags);
        return 3;
    }
    let voxPath;
    try {
        voxPath = resolveVoxPath();
    }
    catch (err) {
        emit({
            ok: false,
            error: {
                code: "VOX_NOT_FOUND",
                message: err.message,
                fix: "install vox and make sure it is available on PATH, then retry",
            },
        }, flags);
        return 2;
    }
    const stem = `seg-${segmentNumber}`;
    const outputDir = join(context.episodePath, "audio", stem);
    const voxStem = stem;
    const artifactDir = join(outputDir, voxStem);
    const mp3Path = join(artifactDir, `${voxStem}.mp3`);
    const timelinePath = join(artifactDir, `${voxStem}.timeline.json`);
    const srtPath = join(artifactDir, `${voxStem}.srt`);
    try {
        await mkdir(outputDir, { recursive: true });
        execFileSync(voxPath, buildSynthArgs(narration, outputDir, voxStem, voice, backend), {
            encoding: "utf8",
            stdio: "pipe",
        });
    }
    catch (err) {
        emit({
            ok: false,
            error: {
                code: "AUDIO_SYNTH_FAILED",
                message: formatExecError(err),
                fix: "verify vox works from the shell with the same text, then retry",
            },
        }, flags);
        return 2;
    }
    try {
        await Promise.all([
            access(mp3Path, constants.F_OK),
            access(timelinePath, constants.F_OK),
            access(srtPath, constants.F_OK),
        ]);
    }
    catch {
        emit({
            ok: false,
            error: {
                code: "AUDIO_SYNTH_OUTPUT_MISSING",
                message: `vox completed but expected outputs were not found under ${artifactDir}`,
                fix: "verify vox subtitle generation is enabled and retry",
            },
        }, flags);
        return 2;
    }
    let timeline;
    try {
        timeline = JSON.parse(await readFile(timelinePath, "utf8"));
    }
    catch (err) {
        emit({
            ok: false,
            error: {
                code: "LOAD_FAIL",
                message: `failed to read ${timelinePath}: ${err.message}`,
            },
        }, flags);
        return 2;
    }
    const sentences = normalizeTimelineSegments(timeline?.segments);
    const duration = deriveDuration(sentences);
    const file = join("audio", stem, stem, `${stem}.mp3`);
    const nextAudio = { ...pipeline.audio };
    if (voice !== undefined)
        nextAudio.voice = voice;
    const segments = Array.isArray(pipeline.audio?.segments) ? [...pipeline.audio.segments] : [];
    const index = segments.findIndex((segment) => Number(segment.segment) === segmentNumber);
    const previous = index >= 0 ? segments[index] : {};
    const nextSegment = {
        ...previous,
        segment: segmentNumber,
        status: "generated",
        duration,
        file,
        sentences,
    };
    if (index >= 0)
        segments[index] = nextSegment;
    else
        segments.push(nextSegment);
    nextAudio.segments = segments.sort((left, right) => Number(left.segment) - Number(right.segment));
    try {
        await savePipeline(context.projectPath, episodeName, {
            ...pipeline,
            audio: nextAudio,
        });
    }
    catch (err) {
        emit({ ok: false, error: { code: "SAVE_FAIL", message: err.message } }, flags);
        return 2;
    }
    const result = { ok: true, mp3: mp3Path, timeline: timelinePath, srt: srtPath, duration };
    if (flags.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    }
    else {
        process.stdout.write(`synthesized audio segment ${segmentNumber}\n`);
    }
    return 0;
}
function buildSynthArgs(text, outputDir, stem, voice, backend) {
    const args = ["synth", text, "-d", outputDir, "-o", `${stem}.mp3`];
    if (voice)
        args.push("--voice", voice);
    if (backend)
        args.push("--backend", backend);
    return args;
}
function resolveVoxPath() {
    const output = execFileSync("which", ["vox"], { encoding: "utf8", stdio: "pipe" }).trim();
    if (!output) {
        throw new Error("vox binary not found on PATH");
    }
    return output;
}
function normalizeTimelineSegments(rawSegments) {
    if (!Array.isArray(rawSegments))
        return [];
    return rawSegments.map((segment) => {
        const start = toSeconds(segment?.start_ms);
        const end = toSeconds(segment?.end_ms);
        return {
            text: typeof segment?.text === "string" ? segment.text : "",
            start,
            end,
            duration: roundSeconds(end - start),
            words: normalizeWords(segment?.words),
        };
    });
}
function normalizeWords(rawWords) {
    if (!Array.isArray(rawWords))
        return [];
    return rawWords.map((word) => {
        const start = toSeconds(word?.start_ms);
        const end = toSeconds(word?.end_ms);
        return {
            text: typeof word?.word === "string" ? word.word : "",
            start,
            end,
            duration: roundSeconds(end - start),
        };
    });
}
function deriveDuration(sentences) {
    const end = sentences.reduce((max, sentence) => Math.max(max, Number(sentence?.end) || 0), 0);
    return roundSeconds(end);
}
function toSeconds(rawMs) {
    const value = Number(rawMs);
    return Number.isFinite(value) ? roundSeconds(value / 1000) : 0;
}
function roundSeconds(value) {
    return Math.round(Math.max(0, value) * 1000) / 1000;
}
function formatExecError(err) {
    const errObj = err;
    const stderr = String(errObj?.stderr || "").trim();
    const stdout = String(errObj?.stdout || "").trim();
    return stderr || stdout || err?.message || String(err);
}
function invalidFlag(name, raw, detail) {
    return {
        ok: false,
        error: {
            code: "INVALID_FLAG",
            message: `invalid --${name}=${raw}: ${detail}`,
        },
    };
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
