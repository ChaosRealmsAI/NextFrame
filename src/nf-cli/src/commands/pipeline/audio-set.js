// Updates pipeline audio settings or per-segment audio metadata for an episode.
import { parseFlags, emit } from "../_helpers/_io.js";
import { loadPipeline, savePipeline } from "../_helpers/_pipeline.js";
import { parseIntegerFlag, parseJsonFlag, parseNumberFlag } from "../_helpers/_pipeline-utils.js";
import { resolveRoot, loadProjectContext } from "../_helpers/_project.js";
export async function run(argv) {
    const { positional, flags } = parseFlags(argv);
    const [projectName, episodeName] = positional;
    if (!projectName || !episodeName) {
        emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe audio-set <project> <episode> --segment=N --status=STATUS --duration=N [--file=PATH] [--sentences=JSON] [--voice=NAME] [--speed=N] [--root=PATH] [--json]" } }, flags);
        return 3;
    }
    const hasSegment = flags.segment !== undefined || flags.status !== undefined || flags.duration !== undefined || flags.file !== undefined || flags.sentences !== undefined;
    const hasVoiceSettings = flags.voice !== undefined || flags.speed !== undefined;
    if (!hasSegment && !hasVoiceSettings) {
        emit({ ok: false, error: { code: "USAGE", message: "audio-set requires segment content or voice settings" } }, flags);
        return 3;
    }
    let segmentNumber;
    let duration;
    let sentences;
    if (hasSegment) {
        if (flags.segment === undefined || flags.status === undefined || flags.duration === undefined) {
            emit({ ok: false, error: { code: "USAGE", message: "audio-set segment updates require --segment, --status, and --duration" } }, flags);
            return 3;
        }
        const parsedSegment = parseIntegerFlag("segment", flags.segment, { min: 1 });
        if (!parsedSegment.ok) {
            emit(parsedSegment, flags);
            return 3;
        }
        segmentNumber = parsedSegment.value;
        const parsedDuration = parseNumberFlag("duration", flags.duration, { min: 0 });
        if (!parsedDuration.ok) {
            emit(parsedDuration, flags);
            return 3;
        }
        duration = parsedDuration.value;
        if (flags.sentences !== undefined) {
            const parsedSentences = parseJsonFlag("sentences", flags.sentences);
            if (!parsedSentences.ok) {
                emit(parsedSentences, flags);
                return 3;
            }
            if (!Array.isArray(parsedSentences.value)) {
                emit({ ok: false, error: { code: "INVALID_FLAG", message: "--sentences must be a JSON array" } }, flags);
                return 3;
            }
            sentences = parsedSentences.value;
        }
    }
    let speed;
    if (flags.speed !== undefined) {
        const parsedSpeed = parseNumberFlag("speed", flags.speed, { min: 0 });
        if (!parsedSpeed.ok) {
            emit(parsedSpeed, flags);
            return 3;
        }
        speed = parsedSpeed.value;
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
    const nextAudio = { ...pipeline.audio };
    if (flags.voice !== undefined)
        nextAudio.voice = flags.voice;
    if (speed !== undefined)
        nextAudio.speed = speed;
    let nextSegment = null;
    if (hasSegment) {
        const segments = Array.isArray(pipeline.audio.segments) ? [...pipeline.audio.segments] : [];
        const index = segments.findIndex((segment) => Number(segment.segment) === segmentNumber);
        const previous = index >= 0 ? segments[index] : {};
        nextSegment = {
            ...previous,
            segment: segmentNumber,
            status: flags.status,
            duration,
            file: flags.file !== undefined ? flags.file : previous.file,
            sentences: sentences !== undefined ? sentences : previous.sentences,
        };
        if (index >= 0)
            segments[index] = nextSegment;
        else
            segments.push(nextSegment);
        nextAudio.segments = segments.sort((a, b) => Number(a.segment) - Number(b.segment));
    }
    let nextPipeline;
    try {
        nextPipeline = await savePipeline(context.projectPath, episodeName, {
            ...pipeline,
            audio: nextAudio,
        });
    }
    catch (err) {
        emit({ ok: false, error: { code: "SAVE_FAIL", message: err.message } }, flags);
        return 2;
    }
    const result = { ok: true, audio: nextPipeline.audio };
    if (nextSegment)
        result.segment = nextSegment;
    if (flags.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    }
    else if (nextSegment) {
        process.stdout.write(`updated audio segment ${nextSegment.segment}\n`);
    }
    else {
        process.stdout.write("updated audio settings\n");
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
