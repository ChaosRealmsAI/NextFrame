import { parseFlags, emit } from "./_io.js";
import { loadPipeline, savePipeline } from "./_pipeline.js";
import { objectOr, parseIntegerFlag, parseJsonFlag, parseNumberFlag } from "./_pipeline-utils.js";
import { resolveRoot, loadProjectContext } from "./_project.js";

const ATOM_TYPES = new Set(["component", "video", "image"]);

export async function run(argv) {
  const { positional, flags } = parseFlags(argv);
  const [projectName, episodeName] = positional;
  if (!projectName || !episodeName) {
    emit({ ok: false, error: { code: "USAGE", message: "usage: nextframe atom-add <project> <episode> --type=component|video|image --name=TEXT [flags] [--root=PATH] [--json]" } }, flags);
    return 3;
  }
  if (!flags.type || !ATOM_TYPES.has(flags.type) || !flags.name) {
    emit({ ok: false, error: { code: "USAGE", message: "atom-add requires --type=component|video|image and --name" } }, flags);
    return 3;
  }

  let segmentNumber;
  let duration;
  let params;
  if (flags.type === "component") {
    if (!flags.scene || flags.segment === undefined) {
      emit({ ok: false, error: { code: "USAGE", message: "component atoms require --scene and --segment" } }, flags);
      return 3;
    }
    const parsedSegment = parseIntegerFlag("segment", flags.segment, { min: 1 });
    if (!parsedSegment.ok) {
      emit(parsedSegment, flags);
      return 3;
    }
    segmentNumber = parsedSegment.value;
    if (flags.params !== undefined) {
      const parsedParams = parseJsonFlag("params", flags.params);
      if (!parsedParams.ok) {
        emit(parsedParams, flags);
        return 3;
      }
      if (!parsedParams.value || typeof parsedParams.value !== "object" || Array.isArray(parsedParams.value)) {
        emit({ ok: false, error: { code: "INVALID_FLAG", message: "--params must be a JSON object" } }, flags);
        return 3;
      }
      params = parsedParams.value;
    }
  }
  if (flags.type === "video") {
    if (!flags.file || flags.duration === undefined) {
      emit({ ok: false, error: { code: "USAGE", message: "video atoms require --file and --duration" } }, flags);
      return 3;
    }
    const parsedDuration = parseNumberFlag("duration", flags.duration, { min: 0 });
    if (!parsedDuration.ok) {
      emit(parsedDuration, flags);
      return 3;
    }
    duration = parsedDuration.value;
  }
  if (flags.type === "image" && !flags.file) {
    emit({ ok: false, error: { code: "USAGE", message: "image atoms require --file" } }, flags);
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

  const id = pipeline.atoms.reduce((max, atom) => Math.max(max, Number(atom.id) || 0), 0) + 1;
  const atom = buildAtom(flags, id, {
    segmentNumber,
    duration,
    params,
  });

  let nextPipeline;
  try {
    nextPipeline = await savePipeline(context.projectPath, episodeName, {
      ...pipeline,
      atoms: [...pipeline.atoms, atom],
    });
  } catch (err) {
    emit({ ok: false, error: { code: "SAVE_FAIL", message: err.message } }, flags);
    return 2;
  }

  const result = { ok: true, atom, atoms: nextPipeline.atoms };
  if (flags.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    process.stdout.write(`added atom ${atom.id}\n`);
  }
  return 0;
}

function buildAtom(flags, id, state) {
  if (flags.type === "component") {
    return {
      id,
      type: flags.type,
      name: flags.name,
      scene: flags.scene,
      segment: state.segmentNumber,
      params: objectOr(state.params),
    };
  }
  if (flags.type === "video") {
    return {
      id,
      type: flags.type,
      name: flags.name,
      file: flags.file,
      duration: state.duration,
    };
  }
  return {
    id,
    type: flags.type,
    name: flags.name,
    file: flags.file,
    dimensions: flags.dimensions,
    size: flags.size,
  };
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
