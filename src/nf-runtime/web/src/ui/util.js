// Shared editor utility helpers for escaping, formatting, paths, and timeline math.
function finiteNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function jsLiteral(value) {
  return JSON.stringify(String(value ?? ""));
}

function buildNfdataUrl(parts) {
  return "nfdata://localhost/" + parts.map((part) => encodeURIComponent(String(part ?? ""))).join("/");
}

function pluralize(count, singular, plural) {
  return count + " " + (count === 1 ? singular : plural);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prettifyLabel(value) {
  const normalized = String(value ?? "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return "Clip";
  }
  return normalized
    .split(" ")
    .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : "")
    .join(" ");
}

function slugify(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "item";
}

function formatTC(seconds) {
  const safeSeconds = Math.max(0, finiteNumber(seconds, 0));
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  return String(minutes).padStart(2, "0") + ":" + String(wholeSeconds).padStart(2, "0");
}

function formatPreciseTime(seconds) {
  const safeSeconds = Math.max(0, finiteNumber(seconds, 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds - minutes * 60;
  const wholeSeconds = Math.floor(remainder);
  const millis = Math.round((remainder - wholeSeconds) * 1000);
  const carry = millis === 1000 ? 1 : 0;
  const safeMillis = millis === 1000 ? 0 : millis;
  const displaySeconds = wholeSeconds + carry;
  const nextMinutes = minutes + Math.floor(displaySeconds / 60);
  const normalizedSeconds = displaySeconds % 60;
  return (
    String(nextMinutes).padStart(2, "0") +
    ":" +
    String(normalizedSeconds).padStart(2, "0") +
    "." +
    String(safeMillis).padStart(3, "0")
  );
}

function formatCompactDuration(seconds) {
  const safeSeconds = Math.max(0, finiteNumber(seconds, 0));
  if (safeSeconds <= 0) {
    return "0s";
  }
  if (safeSeconds >= 60) {
    const minutes = Math.floor(safeSeconds / 60);
    const remainder = safeSeconds - minutes * 60;
    if (remainder < 0.05) {
      return minutes + "m";
    }
    const wholeRemainder = Math.round(remainder * 10) / 10;
    return minutes + "m " + String(wholeRemainder).replace(/\.0$/, "") + "s";
  }
  const rounded = Math.round(safeSeconds * 10) / 10;
  return String(rounded).replace(/\.0$/, "") + "s";
}

function formatRelativeUpdated(raw) {
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    return raw ? String(raw) : "updated recently";
  }

  const diffMs = Date.now() - timestamp;
  if (diffMs < 60000) {
    return "edited just now";
  }

  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) {
    return "edited " + minutes + "m ago";
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return "edited " + hours + "h ago";
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return "edited " + days + "d ago";
  }

  return "updated " + new Date(timestamp).toLocaleDateString();
}

function formatProjectUpdated(raw) {
  const value = formatRelativeUpdated(raw);
  if (value.indexOf("edited ") === 0) {
    return "last updated " + value.slice("edited ".length);
  }
  if (value.indexOf("updated ") === 0) {
    return "last updated " + value.slice("updated ".length);
  }
  return "last updated " + value;
}

function readProjectPath(projectName) {
  return projectsCache.find((entry) => entry?.name === projectName)?.path || "Bridge IPC project";
}

function findEpisodeEntry(episodeName) {
  return episodesCache.find((entry) => entry?.name === episodeName) || null;
}

function findSegmentEntry(segmentName) {
  return segmentsCache.find((entry) => entry?.name === segmentName) || null;
}

function getCurrentEpisodePath() {
  const episodeEntry = findEpisodeEntry(currentEpisode);
  if (episodeEntry?.path) {
    return episodeEntry.path;
  }
  if (currentSegmentPath) {
    const normalized = String(currentSegmentPath);
    const slashIndex = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
    return slashIndex >= 0 ? normalized.slice(0, slashIndex) : null;
  }
  return null;
}

function getProjectDisplayName() {
  return currentProject || "Projects";
}

function getEpisodeDisplayName() {
  return currentEpisode || "Episode";
}

function getSegmentDisplayName() {
  return currentSegment || "Segment";
}

function getBridgeMessage(error) {
  return error?.message === "IPC unavailable"
    ? DESKTOP_CONNECT_MESSAGE
    : (error?.message || DESKTOP_CONNECT_MESSAGE);
}

function deriveTimelineDuration(timeline) {
  const direct = finiteNumber(timeline?.duration, 0);
  const meta = finiteNumber(timeline?.meta?.duration, 0);
  const tracks = Array.isArray(timeline?.tracks) ? timeline.tracks : [];
  const layers = Array.isArray(timeline?.layers) ? timeline.layers : [];
  const derived = tracks.reduce((maxEnd, track) => {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    return clips.reduce((clipMax, clip) => {
      const timing = deriveClipTiming(clip);
      const start = timing.start;
      const duration = timing.duration;
      return Math.max(clipMax, start + duration);
    }, maxEnd);
  }, 0);
  const derivedLayers = layers.reduce((maxEnd, layer) => {
    const timing = deriveClipTiming(layer);
    return Math.max(maxEnd, timing.start + timing.duration);
  }, 0);
  return Math.max(direct, meta, derived, derivedLayers);
}

function deriveClipTiming(clip) {
  const start = Math.max(0, finiteNumber(clip?.start, 0));
  const explicitDuration = finiteNumber(clip?.dur ?? clip?.duration, NaN);
  const end = finiteNumber(clip?.end, NaN);
  const duration = Number.isFinite(explicitDuration)
    ? Math.max(0, explicitDuration)
    : Math.max(0, end - start);
  return { start, duration };
}

function getTimelineTracks(timeline) {
  if (Array.isArray(timeline?.tracks) && timeline.tracks.length) {
    return timeline.tracks;
  }
  if (!Array.isArray(timeline?.layers)) {
    return [];
  }
  return timeline.layers.map(function(layer, index) {
    return {
      id: layer?.id || ("layer-" + (index + 1)),
      label: layer?.id || layer?.scene || ("Layer " + (index + 1)),
      kind: "layer",
      clips: [layer],
    };
  });
}

// v0.1 → v0.3 scene ID mapping
const SCENE_ALIASES = {
  kineticHeadline: "headline",
  htmlSlide: "headline",
  svgOverlay: "headline",
  markdownSlide: "headline",
  cornerBadge: "lowerThird",
  orbitRings: "circleRipple",
  lowerThirdVelvet: "lowerThird",
  textOverlay: "headline",
  barChartReveal: "barChart",
  dataPulse: "barChart",
  shapeBurst: "confetti",
  spotlightSweep: "auroraGradient",
  pixelRain: "particleFlow",
  glitchText: "headline",
  countdown: "numberCounter",
  lineChart: "lineChart",
  imageHero: "imageHero",
};

function resolveSceneId(id) {
  if (!id) return id;
  if (window.__engineV2 && window.__engineV2.SCENE_REGISTRY && window.__engineV2.SCENE_REGISTRY[id]) return id;
  return SCENE_ALIASES[id] || id;
}

function buildPreviewTimeline(timeline) {
  const source = timeline && typeof timeline === "object" ? timeline : {};
  const project = source.project && typeof source.project === "object" ? source.project : {};
  const width = Math.max(1, finiteNumber(source.width ?? project.width, 1920));
  const height = Math.max(1, finiteNumber(source.height ?? project.height, 1080));
  const fps = Math.max(1, finiteNumber(source.fps ?? project.fps, 30));
  const duration = Math.max(0, deriveTimelineDuration(source));

  if (Array.isArray(source.layers) && source.layers.length) {
    return {
      width: width,
      height: height,
      fps: fps,
      duration: duration,
      background: source.background || "#05050c",
      layers: source.layers.map(function(layer, index) {
        const timing = deriveClipTiming(layer);
        return Object.assign({}, layer, {
          id: layer?.id || ("layer-" + (index + 1)),
          start: timing.start,
          dur: timing.duration,
        });
      }),
    };
  }

  const layers = [];
  getTimelineTracks(source).forEach(function(track, trackIndex) {
    const clips = Array.isArray(track?.clips) ? track.clips : [];
    clips.forEach(function(clip, clipIndex) {
      const timing = deriveClipTiming(clip);
      layers.push(Object.assign({}, clip, {
        id: clip?.id || ((track?.id || ("track-" + (trackIndex + 1))) + "-" + (clipIndex + 1)),
        scene: resolveSceneId(clip?.scene || clip?.type || ""),
        start: timing.start,
        dur: timing.duration,
      }));
    });
  });

  return {
    width: width,
    height: height,
    fps: fps,
    duration: duration,
    background: source.background || "#05050c",
    layers: layers,
  };
}

function deriveTrackLabel(track, index) {
  if (track?.label) return String(track.label);
  if (track?.name) return String(track.name);
  const prefix = String(track?.kind || "").toLowerCase() === "audio" ? "A" : "V";
  return prefix + String(index + 1);
}

function deriveTrackDisplayId(track, index) {
  return String(track?.id || deriveTrackLabel(track, index));
}

function deriveClipLabel(clip, clipIndex) {
  return clip?.name || clip?.label || prettifyLabel(clip?.scene || clip?.type || clip?.id || ("Clip " + (clipIndex + 1)));
}

function deriveClipType(clip, track) {
  return prettifyLabel(clip?.type || clip?.scene || track?.kind || "clip").toUpperCase();
}

function deriveClipFamily(clip, track) {
  const raw = String(clip?.scene || clip?.type || track?.kind || "").toLowerCase();
  if (raw.includes("kineticheadline")) return "canvas";
  if (raw.includes("htmlslide") || raw.includes("html") || raw.includes("audio")) return "html";
  if (raw.includes("svgoverlay") || raw.includes("svg")) return "svg";
  if (raw.includes("markdownslide") || raw.includes("markdown") || raw.includes("md")) return "md";
  if (raw.includes("videoclip")) return "video";
  return "";
}

function deriveClipClass(clip, track) {
  const raw = String(clip?.type || clip?.scene || track?.kind || "").toLowerCase();
  if (raw.includes("canvas")) return "type-canvas";
  if (raw.includes("html") || raw.includes("audio")) return "type-html";
  if (raw.includes("svg")) return "type-svg";
  if (raw.includes("md") || raw.includes("markdown")) return "type-md";
  if (raw.includes("multi") || raw.includes("composite")) return "type-multi";
  return "type-video";
}

function deriveClipPalette(clip, track) {
  const raw = String(clip?.scene || clip?.type || track?.kind || "").toLowerCase();
  if (raw.includes("auroragradient") || raw.includes("fluidbackground") || raw.includes("cornerbadge")) {
    return {
      background: "rgba(160,160,170,0.18)",
      border: "rgba(160,160,170,0.28)",
      color: "rgba(226,226,232,0.88)",
    };
  }
  if (raw.includes("kineticheadline")) {
    return {
      background: "rgba(218,119,86,0.26)",
      border: "rgba(218,119,86,0.44)",
      color: "rgba(255,201,181,0.96)",
    };
  }
  if (raw.includes("htmlslide")) {
    return {
      background: "rgba(124,179,122,0.24)",
      border: "rgba(124,179,122,0.4)",
      color: "rgba(203,236,193,0.96)",
    };
  }
  if (raw.includes("svgoverlay")) {
    return {
      background: "rgba(138,111,174,0.28)",
      border: "rgba(138,111,174,0.46)",
      color: "rgba(226,203,255,0.96)",
    };
  }
  if (raw.includes("markdownslide")) {
    return {
      background: "rgba(201,123,158,0.26)",
      border: "rgba(201,123,158,0.42)",
      color: "rgba(255,205,226,0.96)",
    };
  }
  if (raw.includes("videoclip")) {
    return {
      background: "rgba(110,158,207,0.26)",
      border: "rgba(110,158,207,0.42)",
      color: "rgba(206,228,255,0.96)",
    };
  }
  if (raw.includes("circleripple") || raw.includes("orbitrings")) {
    return {
      background: "rgba(222,193,92,0.26)",
      border: "rgba(222,193,92,0.42)",
      color: "rgba(255,238,180,0.96)",
    };
  }
  return {
    background: "rgba(160,160,170,0.18)",
    border: "rgba(160,160,170,0.28)",
    color: "rgba(226,226,232,0.88)",
  };
}

function deriveClipInlineStyle(clip, track, totalDuration) {
  const timing = deriveClipTiming(clip);
  const start = timing.start;
  const duration = timing.duration;
  const left = Math.max(0, Math.min(100, percentOfTotal(start, totalDuration)));
  const width = Math.max(0, Math.min(100 - left, percentOfTotal(duration, totalDuration)));
  const palette = deriveClipPalette(clip, track);
  return (
    "left:" + left + "%;" +
    "width:" + width + "%;" +
    "min-width:12px;" +
    "background:" + palette.background + ";" +
    "border:1px solid " + palette.border + ";" +
    "color:" + palette.color + ";"
  );
}

function formatNfTimeValue(seconds) {
  const safeSeconds = Math.max(0, finiteNumber(seconds, 0));
  return String(Math.round(safeSeconds * 1000) / 1000);
}

function setNfTime(id, seconds, text) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }
  if (typeof text === "string") {
    element.textContent = text;
  }
  element.setAttribute("data-nf-time", formatNfTimeValue(seconds));
}

function setElementState(id, state) {
  const element = document.getElementById(id);
  if (element) {
    element.setAttribute("data-nf-state", state);
  }
}

function setText(id, text) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = text;
  }
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value;
  }
}

function setReadout(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function restartStaggerAnimations(target) {
  target.querySelectorAll(".stagger-in").forEach((element) => {
    element.style.animation = "none";
    element.offsetHeight;
    element.style.animation = "";
  });
}
