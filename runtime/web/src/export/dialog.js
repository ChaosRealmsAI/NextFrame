import bridge from "../bridge.js";

const RESOLUTION_PRESETS = [
  { id: "1080p", label: "1080p", width: 1920, height: 1080 },
  { id: "720p", label: "720p", width: 1280, height: 720 },
  { id: "480p", label: "480p", width: 854, height: 480 },
];

const FPS_PRESETS = [
  { id: "fps-30", label: "30", value: 30 },
  { id: "fps-60", label: "60", value: 60 },
  { id: "fps-24", label: "24", value: 24 },
];

const STYLE_ID = "nextframe-export-dialog-style";
let activeDialog = null;

export function showExportDialog({ store } = {}) {
  if (!store?.state || typeof store.subscribe !== "function") {
    throw new TypeError("showExportDialog({ store }) requires a compatible store");
  }

  if (activeDialog) {
    activeDialog.focus();
    return activeDialog.promise;
  }

  installStyles();

  const state = {
    pid: null,
    pollingTimer: 0,
    resolve: () => {},
    promise: null,
    running: false,
    closed: false,
    autoRevealed: false,
    outputPath: "",
  };

  const overlay = document.createElement("div");
  overlay.className = "export-overlay";
  overlay.setAttribute("role", "presentation");

  const dialog = document.createElement("div");
  dialog.className = "export-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "export-dialog-title");
  overlay.append(dialog);

  const title = document.createElement("h2");
  title.id = "export-dialog-title";
  title.className = "export-title";
  title.textContent = "Export MP4";

  const subtitle = document.createElement("p");
  subtitle.className = "export-subtitle";
  subtitle.textContent = "Render the current timeline through the recorder subprocess.";

  const resolutionGroup = document.createElement("fieldset");
  resolutionGroup.className = "export-group";
  const resolutionLegend = document.createElement("legend");
  resolutionLegend.textContent = "Resolution";
  resolutionGroup.append(resolutionLegend);

  const defaultResolution = RESOLUTION_PRESETS[0];
  const resolutionInputs = new Map();
  for (const preset of RESOLUTION_PRESETS) {
    const label = createChoice({
      name: "export-resolution",
      value: preset.id,
      title: preset.label,
      subtitle: `${preset.width} x ${preset.height}`,
      checked: preset.id === defaultResolution.id,
    });
    const input = label.querySelector("input");
    resolutionInputs.set(preset.id, input);
    resolutionGroup.append(label);
  }

  const fpsGroup = document.createElement("fieldset");
  fpsGroup.className = "export-group";
  const fpsLegend = document.createElement("legend");
  fpsLegend.textContent = "FPS";
  fpsGroup.append(fpsLegend);

  const defaultFps = chooseDefaultFps(store.state.project?.fps);
  const fpsInputs = new Map();
  for (const preset of FPS_PRESETS) {
    const label = createChoice({
      name: "export-fps",
      value: String(preset.value),
      title: preset.label,
      subtitle: "frames/sec",
      checked: preset.value === defaultFps,
    });
    const input = label.querySelector("input");
    fpsInputs.set(preset.value, input);
    fpsGroup.append(label);
  }

  const pathGroup = document.createElement("div");
  pathGroup.className = "export-path-group";
  const pathLabel = document.createElement("label");
  pathLabel.className = "export-field-label";
  pathLabel.textContent = "Output path";
  const pathRow = document.createElement("div");
  pathRow.className = "export-path-row";
  const outputInput = document.createElement("input");
  outputInput.className = "export-input";
  outputInput.type = "text";
  outputInput.value = defaultOutputPath(store.state);
  outputInput.spellcheck = false;
  const browseButton = document.createElement("button");
  browseButton.type = "button";
  browseButton.className = "export-browse";
  browseButton.textContent = "Browse";
  pathRow.append(outputInput, browseButton);
  pathGroup.append(pathLabel, pathRow);

  const durationGroup = document.createElement("div");
  durationGroup.className = "export-duration-group";
  const durationLabel = document.createElement("label");
  durationLabel.className = "export-field-label";
  durationLabel.textContent = "Duration (seconds)";
  const durationInput = document.createElement("input");
  durationInput.className = "export-input";
  durationInput.type = "number";
  durationInput.min = "0.1";
  durationInput.step = "0.1";
  durationInput.value = String(defaultDuration(store.state.timeline?.duration));
  durationGroup.append(durationLabel, durationInput);

  const progressValue = document.createElement("div");
  progressValue.className = "export-progress-value";
  progressValue.textContent = "Idle";
  const progressTrack = document.createElement("div");
  progressTrack.className = "export-progress-track";
  const progressBar = document.createElement("div");
  progressBar.className = "export-progress-bar";
  progressTrack.append(progressBar);
  const meta = document.createElement("div");
  meta.className = "export-meta";
  meta.textContent = "Waiting to start export.";
  const error = document.createElement("div");
  error.className = "export-error";
  error.hidden = true;

  const footer = document.createElement("div");
  footer.className = "export-footer";
  const revealButton = document.createElement("button");
  revealButton.type = "button";
  revealButton.className = "export-reveal";
  revealButton.textContent = "Reveal in Finder";
  revealButton.hidden = true;
  const spacer = document.createElement("div");
  spacer.className = "export-spacer";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "export-cancel";
  cancelButton.textContent = "Cancel";
  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.className = "export-start";
  startButton.textContent = "Start";
  footer.append(revealButton, spacer, cancelButton, startButton);

  dialog.append(
    title,
    subtitle,
    resolutionGroup,
    fpsGroup,
    pathGroup,
    durationGroup,
    progressValue,
    progressTrack,
    meta,
    error,
    footer,
  );

  document.body.append(overlay);
  outputInput.focus();
  outputInput.select();

  state.promise = new Promise((resolve) => {
    state.resolve = resolve;
  });

  activeDialog = {
    promise: state.promise,
    focus() {
      outputInput.focus();
    },
  };

  const close = () => {
    if (state.closed) {
      return;
    }

    state.closed = true;
    window.clearInterval(state.pollingTimer);
    overlay.remove();
    activeDialog = null;
    state.resolve();
  };

  const setError = (message) => {
    const hasMessage = typeof message === "string" && message.length > 0;
    error.hidden = !hasMessage;
    error.textContent = hasMessage ? message : "";
  };

  const setProgress = ({ percent, label, detail }) => {
    const value = clampPercent(percent);
    progressBar.style.width = `${value}%`;
    progressValue.textContent = label;
    meta.textContent = detail;
  };

  const setRunning = (running) => {
    state.running = running;
    browseButton.disabled = running;
    outputInput.disabled = running;
    durationInput.disabled = running;
    startButton.disabled = running;

    for (const input of resolutionInputs.values()) {
      input.disabled = running;
    }

    for (const input of fpsInputs.values()) {
      input.disabled = running;
    }
  };

  const syncStatus = async () => {
    if (!state.pid) {
      return;
    }

    const status = await bridge.call("export.status", { pid: state.pid });
    const percent = Number(status?.percent) || 0;
    const eta = Number(status?.eta) || 0;
    const outputPath = typeof status?.outputPath === "string" ? status.outputPath : outputInput.value;
    state.outputPath = outputPath;

    if (status?.state === "running") {
      setProgress({
        percent,
        label: `Rendering ${formatPercent(percent)}`,
        detail: `ETA ${formatEta(eta)}  |  ${outputPath}`,
      });
      return;
    }

    window.clearInterval(state.pollingTimer);
    state.pollingTimer = 0;
    setRunning(false);
    revealButton.hidden = status?.state !== "done";

    if (status?.state === "done") {
      setError("");
      setProgress({
        percent: 100,
        label: "Export complete",
        detail: outputPath,
      });
      outputInput.value = outputPath;

      if (!state.autoRevealed) {
        state.autoRevealed = true;
        try {
          await bridge.call("fs.reveal", { path: outputPath });
        } catch (revealError) {
          const revealMessage =
            revealError instanceof Error ? revealError.message : String(revealError);
          setError(revealMessage);
        }
      }
      return;
    }

    const reason = typeof status?.error === "string" && status.error.length > 0
      ? status.error
      : "Export failed";
    setError(reason);
    setProgress({
      percent,
      label: "Export failed",
      detail: outputPath,
    });
  };

  const startPolling = () => {
    window.clearInterval(state.pollingTimer);
    state.pollingTimer = window.setInterval(() => {
      void syncStatus().catch((pollError) => {
        const message = pollError instanceof Error ? pollError.message : String(pollError);
        window.clearInterval(state.pollingTimer);
        state.pollingTimer = 0;
        setRunning(false);
        setError(message);
        setProgress({
          percent: 0,
          label: "Status unavailable",
          detail: "The recorder process could not be queried.",
        });
      });
    }, 500);
  };

  browseButton.addEventListener("click", async () => {
    setError("");
    const defaultName = basename(outputInput.value) || "NextFrame-export.mp4";
    const result = await bridge.call("fs.dialogSave", { defaultName });
    if (typeof result?.path === "string" && result.path.length > 0) {
      outputInput.value = result.path;
    }
  });

  startButton.addEventListener("click", async () => {
    setError("");

    const resolution = selectedResolution(resolutionInputs);
    const fps = selectedFps(fpsInputs);
    const duration = Number(durationInput.value);
    const outputPath = outputInput.value.trim();
    state.outputPath = outputPath;

    if (!outputPath) {
      setError("Output path is required.");
      outputInput.focus();
      return;
    }

    if (!Number.isFinite(duration) || duration <= 0) {
      setError("Duration must be greater than 0.");
      durationInput.focus();
      return;
    }

    revealButton.hidden = true;
    state.autoRevealed = false;
    setRunning(true);
    setProgress({
      percent: 0,
      label: "Starting export",
      detail: outputPath,
    });

    try {
      const result = await bridge.call("export.start", {
        outputPath,
        width: resolution.width,
        height: resolution.height,
        fps,
        duration,
      });

      if (!result?.ok) {
        setRunning(false);
        setError(humanizeStartError(result?.error));
        setProgress({
          percent: 0,
          label: "Unable to start export",
          detail: outputPath,
        });
        return;
      }

      state.pid = Number(result.pid);
      setProgress({
        percent: 0,
        label: `Recorder pid ${state.pid}`,
        detail: typeof result?.logPath === "string" ? result.logPath : outputPath,
      });
      startPolling();
      await syncStatus();
    } catch (startError) {
      setRunning(false);
      const message = startError instanceof Error ? startError.message : String(startError);
      setError(message);
      setProgress({
        percent: 0,
        label: "Unable to start export",
        detail: outputPath,
      });
    }
  });

  cancelButton.addEventListener("click", async () => {
    if (!state.running || !state.pid) {
      close();
      return;
    }

    try {
      await bridge.call("export.cancel", { pid: state.pid });
      await syncStatus();
    } catch (cancelError) {
      const message = cancelError instanceof Error ? cancelError.message : String(cancelError);
      setError(message);
    } finally {
      setRunning(false);
    }
  });

  revealButton.addEventListener("click", async () => {
    setError("");
    try {
      await bridge.call("fs.reveal", { path: state.outputPath || outputInput.value.trim() });
    } catch (revealError) {
      const message = revealError instanceof Error ? revealError.message : String(revealError);
      setError(message);
    }
  });

  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay && !state.running) {
      close();
    }
  });

  const onKeyDown = (event) => {
    if (event.key !== "Escape") {
      return;
    }

    event.preventDefault();
    if (state.running && state.pid) {
      void bridge.call("export.cancel", { pid: state.pid }).then(() => syncStatus()).catch(() => {});
      return;
    }

    window.removeEventListener("keydown", onKeyDown);
    close();
  };

  window.addEventListener("keydown", onKeyDown);
  state.promise.finally(() => {
    window.removeEventListener("keydown", onKeyDown);
  });

  return state.promise;
}

function createChoice({ name, value, title, subtitle, checked }) {
  const label = document.createElement("label");
  label.className = "export-choice";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;

  const copy = document.createElement("span");
  copy.className = "export-choice-copy";

  const strong = document.createElement("strong");
  strong.textContent = title;

  const small = document.createElement("small");
  small.textContent = subtitle;

  copy.append(strong, small);
  label.append(input, copy);
  return label;
}

function selectedResolution(inputs) {
  for (const preset of RESOLUTION_PRESETS) {
    if (inputs.get(preset.id)?.checked) {
      return preset;
    }
  }

  return RESOLUTION_PRESETS[0];
}

function selectedFps(inputs) {
  for (const preset of FPS_PRESETS) {
    if (inputs.get(preset.value)?.checked) {
      return preset.value;
    }
  }

  return FPS_PRESETS[0].value;
}

function chooseDefaultFps(value) {
  const numeric = Number(value);
  return FPS_PRESETS.find((preset) => preset.value === numeric)?.value ?? 30;
}

function defaultDuration(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 30;
  }

  return Math.max(0.1, Math.round(numeric * 10) / 10);
}

function defaultOutputPath(state) {
  const projectName = sanitizeProjectName(readProjectName(state));
  return `~/Movies/NextFrame/${projectName}-${timestampForFileName()}.mp4`;
}

function readProjectName(state) {
  const filePath = typeof state?.filePath === "string" ? state.filePath : "";
  const fileName = basename(filePath) || "Untitled";
  return fileName.replace(/\.[^.]+$/, "") || "Untitled";
}

function sanitizeProjectName(value) {
  return String(value || "Untitled")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "") || "Untitled";
}

function timestampForFileName() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ];
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return `${parts.join("")}-${time.join("")}`;
}

function basename(filePath) {
  return String(filePath || "").split(/[\\/]/).pop() || "";
}

function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(100, Math.max(0, value));
}

function formatPercent(value) {
  return `${Math.round(clampPercent(value))}%`;
}

function formatEta(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0s";
  }

  const totalSeconds = Math.ceil(value);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function humanizeStartError(error) {
  if (error === "recorder_not_found") {
    return "Recorder not found. Set NEXTFRAME_RECORDER_PATH or build MediaAgentTeam/recorder.";
  }

  if (error === "export_already_running") {
    return "An export is already running.";
  }

  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  return "Unable to start export.";
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .export-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      padding: 24px;
      background: rgba(9, 14, 22, 0.52);
      backdrop-filter: blur(14px);
    }

    .export-dialog {
      width: min(640px, 100%);
      display: grid;
      gap: 14px;
      padding: 24px;
      border: 1px solid rgba(157, 173, 194, 0.24);
      border-radius: 22px;
      background:
        linear-gradient(180deg, rgba(19, 27, 38, 0.98), rgba(10, 16, 25, 0.98)),
        radial-gradient(circle at top right, rgba(244, 182, 86, 0.24), transparent 36%);
      box-shadow: 0 28px 80px rgba(0, 0, 0, 0.36);
      color: #f4f7fb;
    }

    .export-title {
      margin: 0;
      font-size: 1.4rem;
      letter-spacing: 0.02em;
    }

    .export-subtitle {
      margin: -6px 0 0;
      color: rgba(217, 224, 233, 0.78);
    }

    .export-group {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .export-group > legend,
    .export-field-label {
      margin-bottom: 6px;
      font-size: 0.9rem;
      font-weight: 600;
      color: rgba(217, 224, 233, 0.9);
    }

    .export-choice {
      position: relative;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid rgba(157, 173, 194, 0.18);
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.04);
      cursor: pointer;
    }

    .export-choice:has(input:checked) {
      border-color: rgba(244, 182, 86, 0.7);
      background: rgba(244, 182, 86, 0.12);
    }

    .export-choice input {
      margin: 0;
    }

    .export-choice-copy {
      display: grid;
      gap: 2px;
    }

    .export-choice-copy small {
      color: rgba(217, 224, 233, 0.7);
    }

    .export-path-group,
    .export-duration-group {
      display: grid;
      gap: 8px;
    }

    .export-path-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
    }

    .export-input,
    .export-browse,
    .export-cancel,
    .export-start,
    .export-reveal {
      border: 1px solid rgba(157, 173, 194, 0.2);
      border-radius: 14px;
      font: inherit;
    }

    .export-input {
      min-width: 0;
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.05);
      color: #f4f7fb;
    }

    .export-input:disabled {
      opacity: 0.7;
    }

    .export-browse,
    .export-cancel,
    .export-reveal,
    .export-start {
      padding: 11px 14px;
      background: rgba(255, 255, 255, 0.06);
      color: #f4f7fb;
      cursor: pointer;
    }

    .export-start {
      border-color: rgba(244, 182, 86, 0.45);
      background: linear-gradient(135deg, rgba(244, 182, 86, 0.92), rgba(228, 139, 61, 0.92));
      color: #1f1406;
      font-weight: 700;
    }

    .export-browse:disabled,
    .export-cancel:disabled,
    .export-start:disabled {
      cursor: wait;
      opacity: 0.68;
    }

    .export-progress-value {
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .export-progress-track {
      overflow: hidden;
      height: 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
    }

    .export-progress-bar {
      width: 0%;
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #f4b656, #d95f4a);
      transition: width 180ms ease;
    }

    .export-meta {
      color: rgba(217, 224, 233, 0.76);
      word-break: break-word;
    }

    .export-error {
      padding: 10px 12px;
      border-radius: 12px;
      background: rgba(205, 71, 71, 0.16);
      color: #ffd3d3;
    }

    .export-footer {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }

    .export-spacer {
      flex: 1 1 auto;
    }

    @media (max-width: 720px) {
      .export-overlay {
        padding: 14px;
      }

      .export-dialog {
        padding: 18px;
      }

      .export-path-row {
        grid-template-columns: 1fr;
      }

      .export-footer {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }

      .export-reveal,
      .export-cancel,
      .export-start {
        width: 100%;
      }

      .export-spacer {
        display: none;
      }
    }
  `;

  document.head.append(style);
}
