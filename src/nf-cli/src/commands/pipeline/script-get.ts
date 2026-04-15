// Reads pipeline script metadata or a single script segment from an episode.
import { parseFlags, emit } from "../_helpers/_io.js";
import { loadPipeline } from "../_helpers/_pipeline.js";
import { parseIntegerFlag } from "../_helpers/_pipeline-utils.js";
import { resolveRoot, loadProjectContext } from "../_helpers/_project.js";

export async function run(argv: string[]) {
  const { positional, flags } = parseFlags(argv);
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe script-get <project> <episode> [--segment=N] [--root=PATH] [--json]" } }, flags);
    return 3;
  }

  let segmentNumber: number | undefined;
  if (flags.segment !== undefined) {
    const parsedSegment = parseIntegerFlag("segment", flags.segment, { min: 1 });
    if (!parsedSegment.ok) {
      emit(parsedSegment, flags);
      return 3;
    }
    segmentNumber = parsedSegment.value;
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

  const value = segmentNumber === undefined
    ? pipeline.script
    : pipeline.script.segments.find((segment: Record<string, unknown>) => Number(segment.segment) === segmentNumber) || null;
  emit({ ok: true, value }, flags);
  return 0;
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
