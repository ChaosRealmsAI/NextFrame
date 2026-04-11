const DEFAULT_BACKGROUND = "#0b0b14";
const DPR_STATE = Symbol("nextframe.engine.dprState");

export const SCENES = new Map();

/**
 * Register a scene renderer in the global scene registry.
 * @param {string} id - The scene identifier used by timeline clips.
 * @param {(t: number, params: object, ctx: CanvasRenderingContext2D, globalT: number, W: number, H: number) => void} fn - The scene render function.
 * @returns {(t: number, params: object, ctx: CanvasRenderingContext2D, globalT: number, W: number, H: number) => void} The registered scene function.
 */
export function registerScene(id, fn) {
  if (typeof id !== "string" || id.length === 0) {
    throw new TypeError("registerScene(id, fn) requires a non-empty string id");
  }

  if (typeof fn !== "function") {
    throw new TypeError("registerScene(id, fn) requires fn to be a function");
  }

  SCENES.set(id, fn);
  return fn;
}

/**
 * Validate the minimal timeline schema used by the rendering core.
 * @param {unknown} timeline - The candidate timeline JSON value.
 * @returns {{ok: boolean, errors: string[]}} Validation status plus a flat error list.
 */
export function validateTimeline(timeline) {
  const errors = [];

  if (!isPlainObject(timeline)) {
    return {
      ok: false,
      errors: ["timeline must be an object"],
    };
  }

  if (!("version" in timeline)) {
    errors.push("timeline.version is required");
  } else if (typeof timeline.version !== "string" && typeof timeline.version !== "number") {
    errors.push("timeline.version must be a string or number");
  }

  if (!isFiniteNumber(timeline.duration) || timeline.duration < 0) {
    errors.push("timeline.duration must be a finite number >= 0");
  }

  if ("background" in timeline && typeof timeline.background !== "string") {
    errors.push("timeline.background must be a string when provided");
  }

  if (!Array.isArray(timeline.tracks)) {
    errors.push("timeline.tracks must be an array");
  } else {
    timeline.tracks.forEach((track, trackIndex) => {
      const trackPath = `timeline.tracks[${trackIndex}]`;

      if (!isPlainObject(track)) {
        errors.push(`${trackPath} must be an object`);
        return;
      }

      if (typeof track.id !== "string" || track.id.length === 0) {
        errors.push(`${trackPath}.id must be a non-empty string`);
      }

      if (typeof track.kind !== "string" || track.kind.length === 0) {
        errors.push(`${trackPath}.kind must be a non-empty string`);
      }

      if (!Array.isArray(track.clips)) {
        errors.push(`${trackPath}.clips must be an array`);
        return;
      }

      track.clips.forEach((clip, clipIndex) => {
        const clipPath = `${trackPath}.clips[${clipIndex}]`;

        if (!isPlainObject(clip)) {
          errors.push(`${clipPath} must be an object`);
          return;
        }

        if (typeof clip.id !== "string" || clip.id.length === 0) {
          errors.push(`${clipPath}.id must be a non-empty string`);
        }

        if (!isFiniteNumber(clip.start) || clip.start < 0) {
          errors.push(`${clipPath}.start must be a finite number >= 0`);
        }

        if (!isFiniteNumber(clip.dur) || clip.dur <= 0) {
          errors.push(`${clipPath}.dur must be a finite number > 0`);
        }

        if (typeof clip.scene !== "string" || clip.scene.length === 0) {
          errors.push(`${clipPath}.scene must be a non-empty string`);
        }

        if ("params" in clip && !isPlainObject(clip.params)) {
          errors.push(`${clipPath}.params must be an object when provided`);
        }
      });

      for (let clipIndex = 0; clipIndex < track.clips.length; clipIndex += 1) {
        const clip = track.clips[clipIndex];
        if (!isFiniteNumber(clip?.start) || !isFiniteNumber(clip?.dur) || clip.dur <= 0) {
          continue;
        }

        const clipEnd = clip.start + clip.dur;
        for (let otherIndex = clipIndex + 1; otherIndex < track.clips.length; otherIndex += 1) {
          const otherClip = track.clips[otherIndex];
          if (!isFiniteNumber(otherClip?.start) || !isFiniteNumber(otherClip?.dur) || otherClip.dur <= 0) {
            continue;
          }

          const otherEnd = otherClip.start + otherClip.dur;
          if (clip.start < otherEnd && otherClip.start < clipEnd) {
            errors.push(
              `${trackPath}.clips[${clipIndex}] overlaps ${trackPath}.clips[${otherIndex}]`,
            );
          }
        }
      }
    });
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Render exactly one frame of a timeline onto a 2D canvas context.
 * @param {CanvasRenderingContext2D} ctx - The destination 2D rendering context.
 * @param {object} timeline - The validated timeline JSON.
 * @param {number} t - The global timeline time in seconds or project units.
 * @returns {void} Nothing.
 */
export function renderAt(ctx, timeline, t) {
  if (!ctx || typeof ctx !== "object" || typeof ctx.save !== "function") {
    throw new TypeError("renderAt(ctx, timeline, t) requires a 2D canvas context");
  }

  const canvas = ctx.canvas;
  if (!canvas) {
    throw new TypeError("renderAt(ctx, timeline, t) requires ctx.canvas");
  }

  const { width: W, height: H } = getDisplaySize(canvas);
  const background = typeof timeline?.background === "string"
    ? timeline.background
    : DEFAULT_BACKGROUND;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
  for (const track of tracks) {
    const clips = Array.isArray(track?.clips) ? track.clips : [];

    for (const clip of clips) {
      if (!isActiveClip(clip, t)) {
        continue;
      }

      const sceneFn = SCENES.get(clip.scene);
      if (typeof sceneFn !== "function") {
        throw new Error(`Scene "${clip.scene}" is not registered`);
      }

      const localT = t - clip.start;
      const params = isPlainObject(clip.params) ? clip.params : {};

      ctx.save();
      try {
        sceneFn(localT, params, ctx, t, W, H);
      } finally {
        ctx.restore();
      }
    }
  }
}

/**
 * Size a canvas backing store for the current DPR and apply a single scale transform.
 * @param {HTMLCanvasElement} canvas - The canvas element to configure.
 * @returns {CanvasRenderingContext2D} The configured 2D rendering context.
 */
export function setupDPR(canvas) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new TypeError("setupDPR(canvas) requires a canvas element");
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("setupDPR(canvas) could not acquire a 2D context");
  }

  const { width, height } = getDisplaySize(canvas);
  const dpr = getDevicePixelRatio();
  const targetWidth = Math.max(1, Math.round(width * dpr));
  const targetHeight = Math.max(1, Math.round(height * dpr));
  const state = canvas[DPR_STATE];

  if (!state || state.width !== targetWidth || state.height !== targetHeight || state.dpr !== dpr) {
    if (canvas.style) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }

    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    canvas[DPR_STATE] = {
      dpr,
      width: targetWidth,
      height: targetHeight,
    };
  }

  return ctx;
}

function getDisplaySize(canvas) {
  const rect = typeof canvas.getBoundingClientRect === "function"
    ? canvas.getBoundingClientRect()
    : null;

  const width = firstFinite(
    rect?.width,
    canvas.clientWidth,
    readStylePixel(canvas.style?.width),
    canvas.width,
    300,
  );
  const height = firstFinite(
    rect?.height,
    canvas.clientHeight,
    readStylePixel(canvas.style?.height),
    canvas.height,
    150,
  );

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function getDevicePixelRatio() {
  const ratio = globalThis.devicePixelRatio;
  return isFiniteNumber(ratio) && ratio > 0 ? ratio : 1;
}

function readStylePixel(value) {
  if (typeof value !== "string") {
    return NaN;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function firstFinite(...values) {
  for (const value of values) {
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return 0;
}

function isActiveClip(clip, t) {
  return isFiniteNumber(clip?.start)
    && isFiniteNumber(clip?.dur)
    && t >= clip.start
    && t < clip.start + clip.dur;
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
