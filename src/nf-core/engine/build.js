// Build HTML from src/nf-core/scenes discovery and inline scene modules.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCENES_DIR = resolve(HERE, "../scenes");
const SCENE_REGISTRY_URL = pathToFileURL(resolve(SCENES_DIR, "index.js")).href;
const SCRUBBER_MAX = 10000;
const CONTROLS_HEIGHT = 52;

function stripESM(code) {
  return code
    .replace(/^import\s+.+?;?\s*$/gm, "")
    .replace(/^export\s+default\s+/gm, "return ")
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, "")
    .replace(/^export\s+async\s+function\s+/gm, "async function ")
    .replace(/^export\s+(function|const|let|var|class)\s+/gm, "$1 ");
}

function sanitizeBundleCode(code) {
  return String(code).replace(/\bSRT\b/g, "srt");
}

function toIdentifier(value) {
  const clean = String(value || "")
    .replace(/[^A-Za-z0-9_$]+/g, "_")
    .replace(/^([^A-Za-z_$])/, "_$1");
  return clean || "_scene";
}

function readDiscoveredScenes(ratio) {
  const script = `
    import { getRegistry } from ${JSON.stringify(SCENE_REGISTRY_URL)};
    const ratio = ${JSON.stringify(ratio)};
    const registry = await getRegistry();
    const entries = [];
    for (const entry of registry.values()) {
      if (!entry?.META || entry.META.ratio !== ratio) continue;
      if (entry.source && entry.source !== "official") continue;
      entries.push({
        id: entry.id,
        label: entry.META.label || entry.id,
        path: entry.path,
        ratio: entry.META.ratio,
      });
    }
    entries.sort((a, b) => a.id.localeCompare(b.id));
    process.stdout.write(JSON.stringify(entries));
  `;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: HERE,
    encoding: "utf8",
  });
  return JSON.parse(output || "[]");
}

function collectSceneModules(timeline) {
  const ratio = String(timeline?.ratio || "16:9");
  const discovered = readDiscoveredScenes(ratio);
  const byId = new Map(discovered.map((entry) => [entry.id, entry]));
  const requested = [];
  for (const layer of timeline.layers || []) {
    if (!layer?.scene || requested.includes(layer.scene)) continue;
    requested.push(layer.scene);
  }

  const missing = requested.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    throw new Error(`missing scenes for ratio ${ratio}: ${missing.join(", ")}`);
  }

  const usedNames = new Set();
  return requested.map((id) => {
    const entry = byId.get(id);
    const baseName = toIdentifier(id);
    let varName = baseName;
    let suffix = 1;
    while (usedNames.has(varName)) {
      suffix += 1;
      varName = `${baseName}_${suffix}`;
    }
    usedNames.add(varName);
    const filePath = resolve(SCENES_DIR, entry.path, "index.js");
    return {
      id,
      label: entry.label,
      varName,
      filePath,
      code: sanitizeBundleCode(stripESM(readFileSync(filePath, "utf8"))).trim(),
    };
  });
}

function buildSceneBundle(scene) {
  return `// ${scene.id} (${scene.filePath})
var ${scene.varName} = (function(){
${scene.code}
return { meta: typeof meta !== "undefined" ? meta : null, render: typeof render === "function" ? render : null };
})();`;
}

function escapeInlineScript(value) {
  return String(value)
    .replace(/<\/script/gi, "<\\/script")
    .replace(/<!--/g, "<\\!--");
}

function serializeTimeline(timeline) {
  return JSON.stringify(JSON.stringify(timeline || {}, null, 2));
}

function buildRuntime() {
  return `(() => {
  const playerShell = document.getElementById("player-shell");
  const stageWrap = document.getElementById("stage-wrap");
  const stage = document.getElementById("stage");
  const controls = document.getElementById("controls");
  const playBtn = document.getElementById("playBtn");
  const scrubber = document.getElementById("scrubber");
  const timeInfo = document.getElementById("timeInfo");
  const phaseInfo = document.getElementById("phaseInfo");
  const audioEl = document.getElementById("timeline-audio");
  const timeline = TIMELINE || {};
  const fps = Number(timeline.fps || 30);
  const duration = Math.max(0, Number(timeline.duration || 0));
  const viewport = {
    width: Number(timeline.width || 1920),
    height: Number(timeline.height || 1080),
  };
  const layers = Array.isArray(timeline.layers) ? timeline.layers : [];
  if (audioEl && timeline.audio) {
    audioEl.src = String(timeline.audio);
  }
  let currentTime = 0;
  let rafId = 0;
  let isPlaying = false;
  let recorderMode = false;
  let dragActive = false;
  let dragWasPlaying = false;
  let clockBaseTime = 0;
  let clockBaseNow = 0;
  let lastVisible = [];

  function clampTime(value) {
    if (!Number.isFinite(value)) return 0;
    if (value < 0) return 0;
    if (value > duration) return duration;
    return value;
  }

  function formatTime(value) {
    return clampTime(value).toFixed(2) + "s";
  }

  function applyScale() {
    const controlsHeight = recorderMode ? 0 : ${CONTROLS_HEIGHT};
    const scale = Math.min(
      window.innerWidth / viewport.width,
      (window.innerHeight - controlsHeight) / viewport.height
    );
    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    stageWrap.style.width = String(viewport.width * safeScale) + "px";
    stageWrap.style.height = String(viewport.height * safeScale) + "px";
    stage.style.transform = "scale(" + safeScale + ")";
  }

  function replayInlineScripts(root) {
    const scripts = root.querySelectorAll("script");
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      for (const attr of oldScript.attributes) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.textContent = oldScript.textContent;
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });
  }

  function renderSceneError(layer, message) {
    return '<div style="position:absolute;inset:24px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,120,120,.35);background:rgba(20,0,0,.4);color:#ffb4b4;font:600 18px monospace">' +
      message + " (" + String(layer.scene || "unknown") + ")</div>";
  }

  function resolveSceneParams(scene, rawParams) {
    const input = rawParams && typeof rawParams === "object" ? rawParams : {};
    const meta = scene && scene.meta && typeof scene.meta === "object" ? scene.meta : {};
    const paramsMeta = meta.params && typeof meta.params === "object" ? meta.params : {};
    const defaults = {};
    for (const [key, spec] of Object.entries(paramsMeta)) {
      if (spec && Object.prototype.hasOwnProperty.call(spec, "default")) {
        defaults[key] = spec.default;
      }
    }
    const themes = meta.themes && typeof meta.themes === "object" ? meta.themes : {};
    const themeKey = input.theme || meta.default_theme;
    const themeValues = themeKey && themes[themeKey] && typeof themes[themeKey] === "object"
      ? themes[themeKey]
      : {};
    return { ...defaults, ...themeValues, ...input };
  }

  function getPhaseLabel(visible) {
    const active = visible[visible.length - 1];
    if (!active) return "idle";
    const meta = active.scene && active.scene.meta ? active.scene.meta : {};
    const label = meta.label || active.layer.scene || "scene";
    const layerId = active.layer.id || active.layer.scene || "layer";
    return layerId + " · " + label;
  }

  function updateControls(time, visible) {
    const activeVisible = visible && visible.length ? visible : lastVisible;
    if (!dragActive) {
      scrubber.value = duration > 0
        ? String(Math.round((clampTime(time) / duration) * ${SCRUBBER_MAX}))
        : "0";
    }
    timeInfo.textContent = formatTime(time) + " / " + formatTime(duration);
    phaseInfo.textContent = "Phase: " + getPhaseLabel(activeVisible);
    playBtn.textContent = isPlaying ? "Pause" : "Play";
  }

  function compose(time) {
    const t = clampTime(time);
    currentTime = t;
    const visible = [];
    const html = [];
    for (let index = 0; index < layers.length; index += 1) {
      const layer = layers[index];
      const start = Number(layer.start || 0);
      const dur = Number(layer.dur || 0);
      if (t < start || t >= start + dur) continue;
      const scene = SCENES[layer.scene];
      let inner = "";
      if (!scene || typeof scene.render !== "function") {
        inner = renderSceneError(layer, "Missing scene renderer");
      } else {
        try {
          inner = scene.render(t - start, resolveSceneParams(scene, layer.params), viewport);
        } catch (err) {
          inner = renderSceneError(layer, String(err && err.message ? err.message : err));
        }
      }
      visible.push({ layer, scene });
      html.push(
        '<div class="nf-layer" data-layer-id="' + String(layer.id || layer.scene || index) + '"' +
        ' style="position:absolute;inset:0;pointer-events:none;z-index:' + index + ';">' +
        inner +
        "</div>"
      );
    }
    stage.innerHTML = html.join("");
    replayInlineScripts(stage);
    lastVisible = visible;
    updateControls(t, visible);
    return { time: t, visible };
  }

  function syncClock(time) {
    clockBaseTime = clampTime(time);
    clockBaseNow = performance.now();
  }

  function stopPlayback() {
    isPlaying = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (audioEl) audioEl.pause();
    updateControls(currentTime, []);
  }

  function tick() {
    if (!isPlaying) return;
    const nextTime = audioEl
      ? clampTime(audioEl.currentTime)
      : clampTime(clockBaseTime + (performance.now() - clockBaseNow) / 1000);
    compose(nextTime);
    if (nextTime >= duration) {
      stopPlayback();
      compose(duration);
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (isPlaying || duration <= 0 || recorderMode) return;
    if (currentTime >= duration) {
      currentTime = 0;
      if (audioEl) audioEl.currentTime = 0;
    }
    isPlaying = true;
    syncClock(currentTime);
    if (audioEl) {
      audioEl.currentTime = currentTime;
      const playPromise = audioEl.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          stopPlayback();
          compose(currentTime);
        });
      }
    }
    updateControls(currentTime, []);
    rafId = requestAnimationFrame(tick);
  }

  function pause() {
    if (!isPlaying) return;
    if (audioEl) currentTime = clampTime(audioEl.currentTime);
    else currentTime = clampTime(clockBaseTime + (performance.now() - clockBaseNow) / 1000);
    stopPlayback();
    compose(currentTime);
  }

  function togglePlayback() {
    if (isPlaying) pause();
    else play();
  }

  function seek(time) {
    const nextTime = clampTime(time);
    currentTime = nextTime;
    syncClock(nextTime);
    if (audioEl) audioEl.currentTime = nextTime;
    return compose(nextTime);
  }

  function scrubberTime() {
    return duration <= 0
      ? 0
      : (Number(scrubber.value || 0) / ${SCRUBBER_MAX}) * duration;
  }

  function extractTime(data) {
    if (typeof data === "number") return clampTime(data);
    if (data && Number.isFinite(data.time)) return clampTime(Number(data.time));
    if (data && Number.isFinite(data.t)) return clampTime(Number(data.t));
    if (data && Number.isFinite(data.currentTime)) return clampTime(Number(data.currentTime));
    return currentTime;
  }

  function enableRecorderMode() {
    if (recorderMode) return;
    recorderMode = true;
    stopPlayback();
    playerShell.style.inset = "0";
    controls.style.display = "none";
    applyScale();
  }

  window.__onFrame = function(data) {
    enableRecorderMode();
    return seek(extractTime(data));
  };

  playBtn.addEventListener("click", () => togglePlayback());
  scrubber.addEventListener("pointerdown", () => {
    dragActive = true;
    dragWasPlaying = isPlaying;
    if (isPlaying) pause();
  });
  scrubber.addEventListener("pointerup", () => {
    dragActive = false;
    seek(scrubberTime());
    if (dragWasPlaying) play();
    dragWasPlaying = false;
  });
  scrubber.addEventListener("input", () => {
    seek(scrubberTime());
  });

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;
    const tag = event.target && event.target.tagName ? event.target.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    event.preventDefault();
    togglePlayback();
  });
  window.addEventListener("resize", applyScale);

  if (audioEl) {
    audioEl.addEventListener("ended", () => {
      currentTime = duration;
      stopPlayback();
      compose(duration);
    });
  }

  applyScale();
  compose(0);
})();`;
}

function buildDocument(timeline, sceneModules) {
  const sceneBundles = sceneModules.map(buildSceneBundle).join("\n\n");
  const sceneMap = sceneModules
    .map((scene) => `${JSON.stringify(scene.id)}: ${scene.varName}`)
    .join(",\n");
  const background = String(timeline.background || "#05050c");
  const width = Number(timeline.width || 1920);
  const height = Number(timeline.height || 1080);
  const scriptBody = escapeInlineScript(`const TIMELINE = JSON.parse(${serializeTimeline(timeline)});
${sceneBundles}
const SCENES = {
${sceneMap}
};
${buildRuntime()}`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NextFrame Build</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: ${background}; color: #f4efe8; font-family: system-ui, -apple-system, sans-serif; }
  body { position: relative; }
  #player-shell {
    position: fixed; inset: 0 0 ${CONTROLS_HEIGHT}px 0;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden; padding: 16px;
  }
  #stage-wrap { position: relative; width: ${width}px; height: ${height}px; }
  #stage {
    position: relative; width: ${width}px; height: ${height}px;
    transform-origin: 0 0; overflow: hidden; background: ${background};
    box-shadow: 0 24px 100px rgba(0, 0, 0, 0.35);
  }
  #controls {
    position: fixed; left: 0; right: 0; bottom: 0; height: ${CONTROLS_HEIGHT}px; z-index: 9999;
    display: flex; align-items: center; gap: 14px; padding: 0 20px;
    background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(10px);
  }
  #playBtn {
    height: 34px; padding: 0 12px; border: 0; border-radius: 999px; cursor: pointer;
    background: #f4efe8; color: #111; font: 600 13px/1 system-ui, -apple-system, sans-serif;
  }
  #scrubber { flex: 1; min-width: 160px; }
  #timeInfo, #phaseInfo { font: 500 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: nowrap; }
  #phaseInfo { opacity: 0.78; }
</style>
</head>
<body>
<div id="player-shell"><div id="stage-wrap"><div id="stage"></div></div></div>
<div id="controls">
  <button id="playBtn" type="button">Play</button>
  <input type="range" id="scrubber" min="0" max="${SCRUBBER_MAX}" value="0">
  <span id="timeInfo">0.00s / 0.00s</span>
  <span id="phaseInfo">Phase: idle</span>
</div>
${timeline.audio ? `<audio id="timeline-audio" preload="auto"></audio>` : ""}
<script>
${scriptBody}
</script>
</body>
</html>
`;
}

export function buildHTML(timeline, outputPath) {
  try {
    const sceneModules = collectSceneModules(timeline || {});
    const html = buildDocument(timeline || {}, sceneModules);
    writeFileSync(outputPath, html, "utf8");
    return {
      ok: true,
      value: {
        path: outputPath,
        size: Buffer.byteLength(html, "utf8"),
        dimensions: `${timeline?.width || 1920}x${timeline?.height || 1080}`,
        fps: Number(timeline?.fps || 30),
        duration: Number(timeline?.duration || 0),
        layers: Array.isArray(timeline?.layers) ? timeline.layers.length : 0,
        scenes: sceneModules.length,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: "BUILD_FAIL",
        message: `Internal: ${err.message}`,
        fix: "check timeline scene ids, ratio, and output path",
      },
    };
  }
}
