// Lists pipeline atoms for an episode and formats them as JSON or a table.
import { parseFlags, emit } from "../_helpers/_io.js";
import { loadPipeline } from "../_helpers/_pipeline.js";
import { formatTable } from "../_helpers/_pipeline-utils.js";
import { resolveRoot, loadProjectContext } from "../_helpers/_project.js";

const ATOM_TYPES = new Set(["component", "video", "image"]);

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe atom-list <project> <episode> [--type=component|video|image] [--root=PATH] [--json]" } }, flags);
    return 3;
  }
  if (flags.type && !ATOM_TYPES.has(String(flags.type))) {
    emit({ ok: false, error: { code: "INVALID_FLAG", message: `invalid --type=${flags.type}` } }, flags);
    return 3;
  }

  const root = resolveRoot(flags);
  let context;
  try {
    context = await loadProjectContext(root, projectName, episodeName);
  } catch (err: unknown) {
    emit(loadContextError(err, projectName, episodeName), flags);
    return 2;
  }

  let pipeline;
  try {
    pipeline = await loadPipeline(context.projectPath, episodeName);
  } catch (err: unknown) {
    emit({ ok: false, error: { code: "LOAD_FAIL", message: (err as Error).message } }, flags);
    return 2;
  }

  const atoms = flags.type ? pipeline.atoms.filter((atom: Record<string, unknown>) => atom.type === flags.type) : pipeline.atoms;
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, atoms }, null, 2) + "\n");
  } else {
    process.stdout.write(renderTable(atoms) + "\n");
  }
  return 0;
}

function renderTable(atoms: Record<string, unknown>[]) {
  if (atoms.length === 0) return "(no atoms)";
  return formatTable(
    ["ID", "TYPE", "NAME", "DETAILS"],
    atoms.map((atom: Record<string, unknown>) => [String(atom.id), String(atom.type), String(atom.name), describeAtom(atom)])
  );
}

function describeAtom(atom: Record<string, unknown>) {
  if (atom.type === "component") return `${atom.scene} seg=${atom.segment}`;
  if (atom.type === "video") return `${atom.file} dur=${atom.duration}`;
  return `${atom.file} ${atom.dimensions || ""} ${atom.size || ""}`.trim();
}

function loadContextError(err: unknown, projectName: string, episodeName: string) {
  if ((err as NodeJS.ErrnoException).code === "ENOENT") {
    return {
      ok: false,
      error: {
        code: "EPISODE_NOT_FOUND",
        message: `project or episode not found: ${projectName}/${episodeName}`,
      },
    };
  }
  return { ok: false, error: { code: "LOAD_FAIL", message: (err as Error).message } };
}
