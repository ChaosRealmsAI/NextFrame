// Reads an episode pipeline or one of its top-level stages.
import { parseFlags, emit } from "../_helpers/_io.js";
import { loadPipeline } from "../_helpers/_pipeline.js";
import { resolveRoot, loadProjectContext } from "../_helpers/_project.js";
const STAGES = new Set(["script", "audio", "atoms", "outputs"]);
export async function run(argv) {
    const { positional, flags } = parseFlags(argv);
    const [projectName, episodeName] = positional;
    if (!projectName || !episodeName) {
        emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe pipeline-get <project> <episode> [--stage=script|audio|atoms|outputs] [--root=PATH] [--json]" } }, flags);
        return 3;
    }
    if (flags.stage && !STAGES.has(String(flags.stage))) {
        emit({ ok: false, error: { code: "INVALID_STAGE", message: `invalid stage: ${flags.stage}` } }, flags);
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
    emit({ ok: true, value: flags.stage ? pipeline[String(flags.stage)] : pipeline }, { ...flags, json: true });
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
