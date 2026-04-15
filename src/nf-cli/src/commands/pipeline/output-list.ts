// Lists pipeline outputs for an episode as JSON or a formatted table.
import { parseFlags, emit } from "../_helpers/_io.js";
import { loadPipeline } from "../_helpers/_pipeline.js";
import { formatTable } from "../_helpers/_pipeline-utils.js";
import { resolveRoot, loadProjectContext } from "../_helpers/_project.js";

export async function run(argv: any) {
  const { positional, flags } = parseFlags(argv);
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe output-list <project> <episode> [--root=PATH] [--json]" } }, flags);
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

  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, outputs: pipeline.outputs }, null, 2) + "\n");
  } else {
    process.stdout.write(renderTable(pipeline.outputs) + "\n");
  }
  return 0;
}

function renderTable(outputs: any) {
  if (outputs.length === 0) return "(no outputs)";
  return formatTable(
    ["ID", "NAME", "FILE", "DURATION", "SIZE", "PUBLISHED"],
    outputs.map((output: any) => [
      String(output.id),
      String(output.name),
      String(output.file),
      String(output.duration),
      String(output.size),
      publishedPlatforms(output),
    ])
  );
}

function publishedPlatforms(output: any) {
  if (!Array.isArray(output.published) || output.published.length === 0) return "-";
  return output.published.map((entry: any) => entry.platform).join(",");
}

function loadContextError(err: any, projectName: any, episodeName: any) {
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
