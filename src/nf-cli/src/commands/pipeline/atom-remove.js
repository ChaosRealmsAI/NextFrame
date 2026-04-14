// Removes an atom from an episode pipeline by atom id.
import { parseFlags, emit } from "../_helpers/_io.js";
import { loadPipeline, savePipeline } from "../_helpers/_pipeline.js";
import { parseIntegerFlag } from "../_helpers/_pipeline-utils.js";
import { resolveRoot, loadProjectContext } from "../_helpers/_project.js";

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName || flags.id === undefined) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe atom-remove <project> <episode> --id=N [--root=PATH] [--json]" } }, flags);
    return 3;
  }

  const parsedId = parseIntegerFlag("id", flags.id, { min: 1 });
  if (!parsedId.ok) {
    emit(parsedId, flags);
    return 3;
  }

  const root = resolveRoot(flags);
  let context;
  try {
    context = await loadProjectContext(root, projectName, episodeName);
  } catch (err) {
    emit(loadContextError(err, projectName, episodeName), flags);
    return 2;
  }

  let pipeline;
  try {
    pipeline = await loadPipeline(context.projectPath, episodeName);
  } catch (err) {
    emit({ ok: false, error: { code: "LOAD_FAIL", message: err.message } }, flags);
    return 2;
  }

  const index = pipeline.atoms.findIndex((atom) => Number(atom.id) === parsedId.value);
  if (index < 0) {
    emit({ ok: false, error: { code: "ATOM_NOT_FOUND", message: `atom not found: ${parsedId.value}` } }, flags);
    return 2;
  }

  const atom = pipeline.atoms[index];
  const atoms = [...pipeline.atoms.slice(0, index), ...pipeline.atoms.slice(index + 1)];
  try {
    await savePipeline(context.projectPath, episodeName, {
      ...pipeline,
      atoms,
    });
  } catch (err) {
    emit({ ok: false, error: { code: "SAVE_FAIL", message: err.message } }, flags);
    return 2;
  }

  const result = { ok: true, atom };
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`removed atom ${atom.id}\n`);
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
