export const ASPECT_PRESETS = [
  {
    id: "youtube-16-9",
    name: "16:9 YouTube",
    ratio: 16 / 9,
    width: 1920,
    height: 1080,
  },
  {
    id: "tiktok-9-16",
    name: "9:16 TikTok / Shorts",
    ratio: 9 / 16,
    width: 1080,
    height: 1920,
  },
  {
    id: "instagram-1-1",
    name: "1:1 Instagram Square",
    ratio: 1,
    width: 1080,
    height: 1080,
  },
  {
    id: "instagram-4-5",
    name: "4:5 Instagram Portrait",
    ratio: 4 / 5,
    width: 1080,
    height: 1350,
  },
  {
    id: "cinema-21-9",
    name: "21:9 Cinematic",
    ratio: 21 / 9,
    width: 2560,
    height: 1080,
  },
];

export const DEFAULT_ASPECT_PRESET = ASPECT_PRESETS[0];

export function findAspectPresetById(presetId) {
  return ASPECT_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function createProjectFromPreset(preset = DEFAULT_ASPECT_PRESET) {
  const resolvedPreset = typeof preset === "string"
    ? findAspectPresetById(preset) ?? DEFAULT_ASPECT_PRESET
    : preset;

  return {
    width: resolvedPreset.width,
    height: resolvedPreset.height,
    aspectRatio: resolvedPreset.ratio,
  };
}

export function createDefaultProject() {
  return createProjectFromPreset(DEFAULT_ASPECT_PRESET);
}

export function normalizeProjectState(project) {
  const fallback = createDefaultProject();
  const width = readPositiveNumber(project?.width) || fallback.width;
  const height = readPositiveNumber(project?.height) || fallback.height;
  const aspectRatio = readPositiveNumber(project?.aspectRatio) || (width / height) || fallback.aspectRatio;

  return {
    width,
    height,
    aspectRatio,
  };
}

export function findAspectPresetForProject(project) {
  const normalized = normalizeProjectState(project);

  return ASPECT_PRESETS.find((preset) => {
    return preset.width === normalized.width
      && preset.height === normalized.height
      && areRatiosEqual(preset.ratio, normalized.aspectRatio);
  }) ?? null;
}

function readPositiveNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function areRatiosEqual(left, right) {
  return Math.abs(left - right) < 0.000001;
}
