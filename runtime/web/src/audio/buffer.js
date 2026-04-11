let decodeAudioContext = null;

const audioBufferCache = new Map();

function isWindowsAbsolutePath(value) {
  return /^[A-Za-z]:[\\/]/.test(value);
}

function createFileUrl(pathname) {
  const normalized = pathname.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "/$1:");
  return encodeURI(`file://${normalized}`);
}

export function normalizeAudioUrl(url) {
  if (typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (isWindowsAbsolutePath(trimmed)) {
    return createFileUrl(trimmed);
  }

  try {
    const base = globalThis.location?.href || "file:///";
    return new URL(trimmed, base).href;
  } catch {
    return trimmed;
  }
}

export function mergeProjectAssets(state) {
  const merged = [];
  const seen = new Set();
  const candidates = [
    ...(Array.isArray(state?.timeline?.assets) ? state.timeline.assets : []),
    ...(Array.isArray(state?.assets) ? state.assets : []),
  ];

  candidates.forEach((asset) => {
    if (!asset || typeof asset !== "object") {
      return;
    }

    const key = typeof asset.id === "string" && asset.id.length > 0
      ? `id:${asset.id}`
      : `path:${asset.path || asset.url || ""}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    merged.push(asset);
  });

  return merged;
}

export function createProjectAssetIndex(state) {
  const byId = new Map();
  const byUrl = new Map();

  mergeProjectAssets(state).forEach((asset) => {
    if (typeof asset.id === "string" && asset.id.length > 0) {
      byId.set(asset.id, asset);
    }

    const normalizedUrl = normalizeAudioUrl(asset.path || asset.url);
    if (normalizedUrl) {
      byUrl.set(normalizedUrl, asset);
    }
  });

  return { byId, byUrl };
}

function getDecodeAudioContextConstructor() {
  return globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext || null;
}

function getDecodeAudioContext() {
  const OfflineAudioContextCtor = getDecodeAudioContextConstructor();
  if (!OfflineAudioContextCtor) {
    return null;
  }

  if (!decodeAudioContext) {
    decodeAudioContext = new OfflineAudioContextCtor(1, 1, 44100);
  }

  return decodeAudioContext;
}

export async function loadAudioBuffer(url) {
  const normalizedUrl = normalizeAudioUrl(url);
  if (!normalizedUrl) {
    return null;
  }

  if (audioBufferCache.has(normalizedUrl)) {
    return audioBufferCache.get(normalizedUrl);
  }

  const pending = (async () => {
    const audioContext = getDecodeAudioContext();
    if (!audioContext || typeof audioContext.decodeAudioData !== "function") {
      return null;
    }

    const response = await fetch(normalizedUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio "${normalizedUrl}" (${response.status})`);
    }

    const encoded = await response.arrayBuffer();
    return audioContext.decodeAudioData(encoded.slice(0));
  })();

  audioBufferCache.set(normalizedUrl, pending);

  try {
    return await pending;
  } catch (error) {
    audioBufferCache.delete(normalizedUrl);
    throw error;
  }
}
