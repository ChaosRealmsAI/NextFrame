// Adds a rendered output record to an episode pipeline.
import { parseFlags, emit } from "../_helpers/_io.js";
import { loadPipeline, savePipeline } from "../_helpers/_pipeline.js";
import { parseNumberFlag } from "../_helpers/_pipeline-utils.js";
import { resolveRoot, loadProjectContext } from "../_helpers/_project.js";
export async function run(argv) {
    const { positional, flags } = parseFlags(argv);
    const [projectName, episodeName] = positional;
    if (!projectName || !episodeName || !flags.name || !flags.file || flags.duration === undefined || flags.size === undefined) {
        emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe output-add <project> <episode> --name=TEXT --file=PATH --duration=N --size=TEXT [--changes=TEXT] [--root=PATH] [--json]" } }, flags);
        return 3;
    }
    const parsedDuration = parseNumberFlag("duration", flags.duration, { min: 0 });
    if (!parsedDuration.ok) {
        emit(parsedDuration, flags);
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
    const id = pipeline.outputs.reduce((max, output) => Math.max(max, Number(output.id) || 0), 0) + 1;
    const output = {
        id,
        name: flags.name,
        file: flags.file,
        duration: parsedDuration.value,
        size: flags.size,
        changes: flags.changes,
        published: [],
    };
    let nextPipeline;
    try {
        nextPipeline = await savePipeline(context.projectPath, episodeName, {
            ...pipeline,
            outputs: [...pipeline.outputs, output],
        });
    }
    catch (err) {
        emit({ ok: false, error: { code: "SAVE_FAIL", message: err.message } }, flags);
        return 2;
    }
    const result = { ok: true, output, outputs: nextPipeline.outputs };
    if (flags.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    }
    else {
        process.stdout.write(`added output ${output.id}\n`);
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
