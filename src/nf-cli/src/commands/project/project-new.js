// Creates a new project directory and writes its initial project.json file.
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parseFlags, emit } from "../_helpers/_io.js";
export async function run(argv) {
    const { positional, flags } = parseFlags(argv);
    const [name] = positional;
    if (!name) {
        emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe project-new <name> [--root=PATH]" } }, flags);
        return 3;
    }
    const root = resolveRoot(flags);
    const path = join(root, name);
    const stamp = new Date().toISOString();
    const project = {
        name,
        created: stamp,
        updated: stamp,
    };
    try {
        await mkdir(root, { recursive: true });
        await mkdir(path);
        await writeFile(join(path, "project.json"), JSON.stringify(project, null, 2) + "\n");
    }
    catch (err) {
        if (err.code === "EEXIST") {
            emit({ ok: false, error: { code: "PROJECT_EXISTS", message: `project already exists: ${path}` } }, flags);
            return 2;
        }
        emit({ ok: false, error: { code: "CREATE_FAIL", message: err.message } }, flags);
        return 2;
    }
    const result = { ok: true, path };
    if (flags.json) {
        process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    }
    else {
        process.stdout.write(`created ${path}\n`);
    }
    return 0;
}
function resolveRoot(flags) {
    return resolve(typeof flags.root === "string" ? flags.root : join(homedir(), "NextFrame", "projects"));
}
