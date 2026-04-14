import { parseFlags, emit } from "./_io.js";
import { loadPipeline } from "./_pipeline.js";
import { formatTable } from "./_pipeline-utils.js";
import { resolveRoot, loadProjectContext } from "./_project.js";

const ATOM_TYPES = new Set(["component", "video", "image"]);

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe atom-list <project> <episode> [--type=component|video|image] [--root=PATH] [--json]" } }, flags);
    return 3;
  }
  if (flags.type && !ATOM_TYPES.has(flags.type)) {
    emit({ ok: false, error: { code: "INVALID_FLAG", message: `invalid --type=${flags.type}` } }, flags);
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

  const atoms = flags.type ? pipeline.atoms.filter((atom) => atom.type === flags.type) : pipeline.atoms;
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, atoms }, null, 2) + "\n");
  } else {
    process.stdout.write(renderTable(atoms) + "\n");
  }
  return 0;
}

function renderTable(atoms) {
  if (atoms.length === 0) return "(no atoms)";
  return formatTable(
    ["ID", "TYPE", "NAME", "DETAILS"],
    atoms.map((atom) => [String(atom.id), String(atom.type), String(atom.name), describeAtom(atom)])
  );
}

function describeAtom(atom) {
  if (atom.type === "component") return `${atom.scene} seg=${atom.segment}`;
  if (atom.type === "video") return `${atom.file} dur=${atom.duration}`;
  return `${atom.file} ${atom.dimensions || ""} ${atom.size || ""}`.trim();
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
