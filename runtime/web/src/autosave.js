import { validateTimeline } from "./engine/index.js";
import { createProjectDocument, readProjectDocument } from "./project/document.js";
import { normalizeTracks } from "./track-flags.js";
import { toast } from "./toast.js";

const AUTOSAVE_INTERVAL_MS = 30_000;
const DEFAULT_BACKGROUND = "#0b0b14";
const DIALOG_STYLE_ID = "nextframe-autosave-dialog-style";
const PATH_PROJECT_PREFIX = "path-";
const UNTITLED_PROJECT_PREFIX = "untitled-";

let untitledAutosaveCounter = 0;

export function startAutosave({ store, bridge } = {}) {
  if (!store || typeof store.subscribe !== "function" || typeof store.mutate !== "function") {
    throw new TypeError("startAutosave({ store, bridge }) requires a compatible store");
  }

  if (typeof bridge?.call !== "function") {
    throw new TypeError("startAutosave({ store, bridge }) requires bridge.call(method, params)");
  }

  let writing = false;
  const previousTimer = normalizeTimerId(store.state?.autosaveTimer);
  if (previousTimer !== null) {
    window.clearInterval(previousTimer);
  }

  syncAutosaveId(store);

  const timerId = window.setInterval(async () => {
    if (writing || store.state?.dirty !== true) {
      return;
    }

    const projectId = syncAutosaveId(store);

    try {
      writing = true;
      await bridge.call("autosave.write", {
        projectId,
        timeline: createProjectDocument(store.state),
      });
      toast("Autosaved", { type: "info", duration: 2000 });
    } catch (error) {
      console.warn("[NextFrame] Autosave failed:", error);
    } finally {
      writing = false;
    }
  }, AUTOSAVE_INTERVAL_MS);

  store.mutate((state) => {
    state.autosaveTimer = timerId;
  });

  const unsubscribe = store.subscribe((state) => {
    const nextAutosaveId = deriveAutosaveId({
      filePath: state.filePath,
      autosaveId: state.autosaveId,
    });
    if (nextAutosaveId !== state.autosaveId) {
      store.mutate((draft) => {
        draft.autosaveId = nextAutosaveId;
      });
    }
  });

  void promptForRecovery({ store, bridge });

  return {
    stop() {
      unsubscribe();
      window.clearInterval(timerId);
      if (store.state?.autosaveTimer === timerId) {
        store.mutate((state) => {
          state.autosaveTimer = null;
        });
      }
    },
  };
}

export function deriveAutosaveId({ filePath, autosaveId } = {}) {
  if (typeof filePath === "string" && filePath.length > 0) {
    return `${PATH_PROJECT_PREFIX}${encodeURIComponent(filePath)}`;
  }

  if (
    typeof autosaveId === "string"
    && autosaveId.startsWith(UNTITLED_PROJECT_PREFIX)
    && autosaveId.length > UNTITLED_PROJECT_PREFIX.length
  ) {
    return autosaveId;
  }

  return createUntitledAutosaveId();
}

export function getProjectFilePathFromAutosaveId(projectId) {
  if (typeof projectId !== "string" || !projectId.startsWith(PATH_PROJECT_PREFIX)) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(projectId.slice(PATH_PROJECT_PREFIX.length));
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

export async function clearAutosave({ bridge, projectId } = {}) {
  if (typeof bridge?.call !== "function") {
    throw new TypeError("clearAutosave({ bridge, projectId }) requires bridge.call(method, params)");
  }

  if (typeof projectId !== "string" || projectId.length === 0) {
    return false;
  }

  await bridge.call("autosave.clear", { projectId });
  return true;
}

function syncAutosaveId(store) {
  const nextAutosaveId = deriveAutosaveId({
    filePath: store.state?.filePath,
    autosaveId: store.state?.autosaveId,
  });

  if (store.state?.autosaveId !== nextAutosaveId) {
    store.mutate((state) => {
      state.autosaveId = nextAutosaveId;
    });
  }

  return nextAutosaveId;
}

async function promptForRecovery({ store, bridge }) {
  let entries;
  try {
    entries = await bridge.call("autosave.list", {});
  } catch (error) {
    console.warn("[NextFrame] Autosave listing failed:", error);
    return;
  }

  const autosaves = Array.isArray(entries)
    ? entries.filter((entry) => typeof entry?.projectId === "string" && entry.projectId.length > 0)
    : [];

  for (const entry of autosaves) {
    const choice = await showRecoveryDialog(entry);

    if (choice === "dismiss") {
      return;
    }

    if (choice === "no") {
      try {
        await clearAutosave({ bridge, projectId: entry.projectId });
      } catch (error) {
        console.warn("[NextFrame] Autosave clear failed:", error);
      }
      continue;
    }

    try {
      const recovered = await bridge.call("autosave.recover", {
        projectId: entry.projectId,
      });
      const projectDocument = readProjectDocument(recovered);
      const validation = validateTimeline(projectDocument.timeline);
      if (!validation.ok) {
        throw new Error(validation.errors.join("\n"));
      }

      const timeline = normalizeTimeline(projectDocument.timeline);
      const filePath = getProjectFilePathFromAutosaveId(entry.projectId);

      store.mutate((state) => {
        state.timeline = timeline;
        state.project = projectDocument.project;
        state.assets = timeline.assets;
        state.assetBuffers = new Map();
        state.filePath = filePath;
        state.playhead = 0;
        state.autosaveId = entry.projectId;
        state.dirty = true;
      });

      if (filePath) {
        void bridge.call("recent.add", { path: filePath }).catch(() => {});
      }

      toast("Recovered autosave", { type: "info", duration: 2000 });
      return;
    } catch (error) {
      console.warn("[NextFrame] Autosave recovery failed:", error);
      toast("Autosave recovery failed", { type: "error", duration: 3000 });
    }
  }
}

function createUntitledAutosaveId() {
  if (globalThis.crypto?.randomUUID) {
    return `${UNTITLED_PROJECT_PREFIX}${globalThis.crypto.randomUUID()}`;
  }

  untitledAutosaveCounter += 1;
  return `${UNTITLED_PROJECT_PREFIX}${Date.now()}-${untitledAutosaveCounter}`;
}

function normalizeTimeline(timeline) {
  return {
    ...timeline,
    background: typeof timeline?.background === "string" ? timeline.background : DEFAULT_BACKGROUND,
    assets: Array.isArray(timeline?.assets) ? timeline.assets : [],
    tracks: normalizeTracks(timeline?.tracks),
  };
}

function normalizeTimerId(value) {
  return typeof value === "number" || typeof value === "object" ? value : null;
}

function showRecoveryDialog(entry) {
  if (!document?.body) {
    return Promise.resolve("dismiss");
  }

  installDialogStyles();

  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "autosave-recovery-backdrop";

    const dialog = document.createElement("div");
    dialog.className = "autosave-recovery-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Recover unsaved project?");

    const title = document.createElement("h2");
    title.className = "autosave-recovery-title";
    title.textContent = "Recover unsaved project?";

    const detail = document.createElement("p");
    detail.className = "autosave-recovery-detail";
    detail.textContent = describeAutosave(entry);

    const actions = document.createElement("div");
    actions.className = "autosave-recovery-actions";

    const yesButton = createDialogButton("Yes", "yes");
    const noButton = createDialogButton("No", "no");
    const dismissButton = createDialogButton("Dismiss", "dismiss");

    const close = (choice) => {
      window.removeEventListener("keydown", onKeyDown);
      backdrop.remove();
      resolve(choice);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close("dismiss");
      }
    };

    yesButton.addEventListener("click", () => close("yes"));
    noButton.addEventListener("click", () => close("no"));
    dismissButton.addEventListener("click", () => close("dismiss"));
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        close("dismiss");
      }
    });

    actions.append(yesButton, noButton, dismissButton);
    dialog.append(title, detail, actions);
    backdrop.append(dialog);
    document.body.append(backdrop);
    window.addEventListener("keydown", onKeyDown);
    yesButton.focus();
  });
}

function describeAutosave(entry) {
  const filePath = getProjectFilePathFromAutosaveId(entry?.projectId);
  if (filePath) {
    return `Autosave found for ${basename(filePath)}.`;
  }

  return "An autosaved untitled project is available.";
}

function createDialogButton(label, variant) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "autosave-recovery-button";
  button.dataset.variant = variant;
  button.textContent = label;
  return button;
}

function basename(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    return "Untitled";
  }

  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function installDialogStyles() {
  if (document.getElementById(DIALOG_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = DIALOG_STYLE_ID;
  style.textContent = `
    .autosave-recovery-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1500;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      background: rgba(8, 8, 12, 0.7);
      backdrop-filter: blur(10px);
    }

    .autosave-recovery-dialog {
      width: min(420px, 100%);
      padding: 22px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 18px;
      background: linear-gradient(180deg, rgba(28, 29, 40, 0.98), rgba(14, 15, 22, 0.98));
      box-shadow: 0 30px 70px rgba(0, 0, 0, 0.45);
    }

    .autosave-recovery-title {
      margin: 0;
      font-size: 18px;
      line-height: 1.2;
    }

    .autosave-recovery-detail {
      margin: 12px 0 0;
      color: rgba(230, 230, 240, 0.72);
    }

    .autosave-recovery-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 20px;
    }

    .autosave-recovery-button {
      min-width: 88px;
      height: 34px;
      padding: 0 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.04);
      color: inherit;
      cursor: pointer;
    }

    .autosave-recovery-button[data-variant="yes"] {
      border-color: color-mix(in srgb, var(--nf-accent, #6366f1) 55%, transparent);
      background: color-mix(in srgb, var(--nf-accent, #6366f1) 24%, transparent);
    }
  `;
  document.head.append(style);
}
