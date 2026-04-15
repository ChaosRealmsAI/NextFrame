// Reads and updates shared project configuration values in project.json.
import { parseFlags, emit } from "../_helpers/_io.js";
import { objectOr } from "../_helpers/_pipeline-utils.js";
import { resolveRoot, loadProjectContext, touchProject } from "../_helpers/_project.js";

export async function run(argv: any) {
  const { positional, flags } = parseFlags(argv);
  const [projectName, tail] = positional;
  if (!projectName || (!flags.get && !flags.set) || (flags.get && flags.set)) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe project-config <project> --get [key] | --set key=value [--root=PATH] [--json]" } }, flags);
    return 3;
  }

  const root = resolveRoot(flags);
  let context;
  try {
    context = await loadProjectContext(root, projectName);
  } catch (err) {
    if (err.code === "ENOENT") {
      emit({ ok: false, error: { code: "PROJECT_NOT_FOUND", message: `project not found: ${projectName}` } }, flags);
      return 2;
    }
    emit({ ok: false, error: { code: "LOAD_FAIL", message: err.message } }, flags);
    return 2;
  }

  if (flags.get) {
    const key = typeof flags.get === "string" ? flags.get : tail;
    const shared = objectOr(context.project.shared);
    const value = key ? shared[key] ?? null : shared;
    if (flags.json) {
      process.stdout.write(JSON.stringify({ ok: true, key: key || null, value }, null, 2) + "\n");
    } else if (typeof value === "string") {
      process.stdout.write(`${value}\n`);
    } else {
      process.stdout.write(JSON.stringify(value, null, 2) + "\n");
    }
    return 0;
  }

  const spec = typeof flags.set === "string" ? flags.set : tail;
  if (!spec || !spec.includes("=")) {
    emit({ ok: false, error: { code: "USAGE", message: "project-config --set requires key=value" } }, flags);
    return 3;
  }

  const eq = spec.indexOf("=");
  const key = spec.slice(0, eq);
  const rawValue = spec.slice(eq + 1);
  if (!key) {
    emit({ ok: false, error: { code: "USAGE", message: "project-config --set requires a non-empty key" } }, flags);
    return 3;
  }

  const value = parseConfigValue(rawValue);
  const project = {
    ...context.project,
    shared: {
      ...objectOr(context.project.shared),
      [key]: value,
    },
  };

  try {
    await touchProject(context.projectFile, project);
  } catch (err) {
    emit({ ok: false, error: { code: "SAVE_FAIL", message: err.message } }, flags);
    return 2;
  }

  const result = { ok: true, key, value };
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`set shared.${key}\n`);
  }
  return 0;
}

function parseConfigValue(rawValue: any) {
  const trimmed = String(rawValue);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}
