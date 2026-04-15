// Updates pipeline script metadata or per-segment script content for an episode.
import { parseFlags, emit } from "../_helpers/_io.js";
import { loadPipeline, savePipeline } from "../_helpers/_pipeline.js";
import { parseIntegerFlag, parseJsonFlag } from "../_helpers/_pipeline-utils.js";
import { resolveRoot, loadProjectContext } from "../_helpers/_project.js";
export async function run(argv) {
    const { positional, flags } = parseFlags(argv);
    const [projectName, episodeName] = positional;
    if (!projectName || !episodeName) {
        emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe script-set <project> <episode> --segment=N --narration=TEXT [--visual=TEXT] [--role=TEXT] [--logic=TEXT] [--arc=JSON] [--principles-*=TEXT] [--root=PATH] [--json]" } }, flags);
        return 3;
    }
    const principleEntries = Object.entries(flags).filter(([key]) => key.startsWith("principles-"));
    const hasSegment = flags.segment !== undefined || flags.narration !== undefined || flags.visual !== undefined || flags.role !== undefined || flags.logic !== undefined;
    const hasMetadata = flags.arc !== undefined || principleEntries.length > 0;
    if (!hasSegment && !hasMetadata) {
        emit({ ok: false, error: { code: "USAGE", message: "script-set requires segment content or script metadata flags" } }, flags);
        return 3;
    }
    let segmentNumber;
    if (hasSegment) {
        if (flags.segment === undefined || flags.narration === undefined) {
            emit({ ok: false, error: { code: "USAGE", message: "script-set segment updates require --segment and --narration" } }, flags);
            return 3;
        }
        const parsedSegment = parseIntegerFlag("segment", flags.segment, { min: 1 });
        if (!parsedSegment.ok) {
            emit(parsedSegment, flags);
            return 3;
        }
        segmentNumber = parsedSegment.value;
    }
    let arc;
    if (flags.arc !== undefined) {
        const parsedArc = parseJsonFlag("arc", flags.arc);
        if (!parsedArc.ok) {
            emit(parsedArc, flags);
            return 3;
        }
        if (!Array.isArray(parsedArc.value)) {
            emit({ ok: false, error: { code: "INVALID_FLAG", message: "--arc must be a JSON array" } }, flags);
            return 3;
        }
        arc = parsedArc.value;
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
    const nextScript = { ...pipeline.script };
    if (arc !== undefined)
        nextScript.arc = arc;
    if (principleEntries.length > 0) {
        nextScript.principles = { ...pipeline.script.principles };
        for (const [key, value] of principleEntries) {
            nextScript.principles[key.slice("principles-".length)] = value;
        }
    }
    let nextSegment = null;
    if (hasSegment) {
        const segments = Array.isArray(pipeline.script.segments) ? [...pipeline.script.segments] : [];
        const index = segments.findIndex((segment) => Number(segment.segment) === segmentNumber);
        const previous = index >= 0 ? segments[index] : {};
        nextSegment = {
            ...previous,
            segment: segmentNumber,
            narration: flags.narration,
            visual: flags.visual !== undefined ? flags.visual : previous.visual,
            role: flags.role !== undefined ? flags.role : previous.role,
            logic: flags.logic !== undefined ? flags.logic : previous.logic,
        };
        if (index >= 0)
            segments[index] = nextSegment;
        else
            segments.push(nextSegment);
        nextScript.segments = segments.sort((a, b) => Number(a.segment) - Number(b.segment));
    }
    let nextPipeline;
    try {
        nextPipeline = await savePipeline(context.projectPath, episodeName, {
            ...pipeline,
            script: nextScript,
        });
    }
    catch (err) {
        emit({ ok: false, error: { code: "SAVE_FAIL", message: err.message } }, flags);
        return 2;
    }
    const result = { ok: true, script: nextPipeline.script };
    if (nextSegment)
        result.segment = nextSegment;
    if (flags.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    }
    else if (nextSegment) {
        process.stdout.write(`updated script segment ${nextSegment.segment}\n`);
    }
    else {
        process.stdout.write("updated script metadata\n");
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
