// Marks a pipeline output as published to a platform with a publish timestamp.
import { parseFlags, emit } from "../_helpers/_io.js";
import { loadPipeline, savePipeline } from "../_helpers/_pipeline.js";
import { parseIntegerFlag } from "../_helpers/_pipeline-utils.js";
import { resolveRoot, loadProjectContext } from "../_helpers/_project.js";

export async function run(argv: any) {
  const { positional, flags } = parseFlags(argv);
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName || flags.id === undefined || !flags.platform) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe output-publish <project> <episode> --id=N --platform=NAME [--root=PATH] [--json]" } }, flags);
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

  const index = pipeline.outputs.findIndex((output: any) => Number(output.id) === parsedId.value);
  if (index < 0) {
    emit({ ok: false, error: { code: "OUTPUT_NOT_FOUND", message: `output not found: ${parsedId.value}` } }, flags);
    return 2;
  }

  const publishedAt = new Date().toISOString();
  const output = pipeline.outputs[index];
  const published = Array.isArray(output.published)
    ? output.published.filter((entry: any) => entry.platform !== flags.platform)
    : [];
  published.push({ platform: flags.platform, publishedAt });
  const nextOutput = { ...output, published };
  const outputs = [...pipeline.outputs];
  outputs[index] = nextOutput;

  try {
    await savePipeline(context.projectPath, episodeName, {
      ...pipeline,
      outputs,
    });
  } catch (err) {
    emit({ ok: false, error: { code: "SAVE_FAIL", message: err.message } }, flags);
    return 2;
  }

  const result = { ok: true, output: nextOutput };
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`published output ${nextOutput.id} to ${flags.platform}\n`);
  }
  return 0;
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
