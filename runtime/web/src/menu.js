import { validateTimeline } from "./engine/index.js";
import { createDefaultTimeline } from "./store.js";

const DEFAULT_SAVE_NAME = "Untitled.nfproj";
const DEFAULT_STATUS = "Ready";
const DEFAULT_BACKGROUND = "#0b0b14";

export function initMenu({ bridge, store }) {
  if (typeof bridge?.call !== "function") {
    throw new TypeError("initMenu({ bridge, store }) requires bridge.call(method, params)");
  }

  if (!store || typeof store.subscribe !== "function" || typeof store.mutate !== "function") {
    throw new TypeError("initMenu({ bridge, store }) requires a compatible store");
  }

  const topMenu = document.getElementById("top-menu");
  if (!topMenu) {
    return { destroy() {} };
  }

  const menuRoots = [...topMenu.querySelectorAll("[data-menu-root]")];
  const statusChip = document.getElementById("project-status");
  const statusLabel = document.getElementById("project-status-label");
  const pathLabel = document.getElementById("project-path-label");
  const zoomLabel = document.getElementById("preview-zoom-label");
  const timeDisplay = document.querySelector(".time-display");
  const previewSlot = document.getElementById("preview-stage-slot");
  const timelinePanel = document.getElementById("bottom-timeline");
  const timelineSplitter = document.getElementById("timeline-splitter");
  const inspectorPanel = document.getElementById("right-inspector");
  const inspectorSplitter = document.getElementById("inspector-splitter");

  let openMenu = null;
  let noticeTimer = 0;

  const render = (state) => {
    const fileName = basename(state.filePath) ?? DEFAULT_SAVE_NAME;
    const isDirty = Boolean(state.dirty);
    const zoom = normalizeZoom(state.ui?.zoom);
    const isTimelineVisible = state.ui?.timelineVisible !== false;
    const isInspectorVisible = state.ui?.inspectorVisible !== false;

    if (statusChip) {
      statusChip.classList.toggle("is-dirty", isDirty);
    }

    if (statusLabel) {
      statusLabel.textContent = isDirty ? "Modified" : DEFAULT_STATUS;
    }

    if (pathLabel) {
      pathLabel.textContent = isDirty ? `${fileName}*` : fileName;
      pathLabel.title = state.filePath ?? DEFAULT_SAVE_NAME;
    }

    if (zoomLabel) {
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
    }

    if (timeDisplay) {
      const total = Number(state.timeline?.duration);
      timeDisplay.textContent = `00:00 / ${formatSeconds(total)}`;
    }

    if (previewSlot) {
      previewSlot.style.setProperty("--preview-zoom", String(zoom));
    }

    if (timelinePanel) {
      timelinePanel.hidden = !isTimelineVisible;
    }

    if (timelineSplitter) {
      timelineSplitter.hidden = !isTimelineVisible;
    }

    if (inspectorPanel) {
      inspectorPanel.hidden = !isInspectorVisible;
    }

    if (inspectorSplitter) {
      inspectorSplitter.hidden = !isInspectorVisible;
    }

    syncCheckmark("timelineVisible", isTimelineVisible);
    syncCheckmark("inspectorVisible", isInspectorVisible);
    document.title = `${isDirty ? "* " : ""}${fileName} - NextFrame`;
  };

  const unsubscribe = store.subscribe(render);

  const closeMenus = () => {
    openMenu = null;
    for (const root of menuRoots) {
      root.dataset.open = "false";
      const trigger = root.querySelector("[data-menu-trigger]");
      if (trigger instanceof HTMLButtonElement) {
        trigger.setAttribute("aria-expanded", "false");
      }
    }
  };

  const openNamedMenu = (name) => {
    openMenu = name;
    for (const root of menuRoots) {
      const isOpen = root.dataset.menuRoot === name;
      root.dataset.open = String(isOpen);
      const trigger = root.querySelector("[data-menu-trigger]");
      if (trigger instanceof HTMLButtonElement) {
        trigger.setAttribute("aria-expanded", String(isOpen));
      }
    }
  };

  const showNotice = (message, { dirty = store.state.dirty } = {}) => {
    window.clearTimeout(noticeTimer);

    if (statusChip) {
      statusChip.classList.toggle("is-dirty", Boolean(dirty));
    }

    if (statusLabel) {
      statusLabel.textContent = message;
      noticeTimer = window.setTimeout(() => render(store.state), 1800);
    }
  };

  const onClick = (event) => {
    const trigger = event.target.closest("[data-menu-trigger]");
    if (trigger instanceof HTMLButtonElement) {
      event.preventDefault();
      const name = trigger.dataset.menuTrigger;
      if (!name) {
        return;
      }

      if (openMenu === name) {
        closeMenus();
      } else {
        openNamedMenu(name);
      }
      return;
    }

    const item = event.target.closest("[data-menu-action]");
    if (!(item instanceof HTMLButtonElement)) {
      return;
    }

    event.preventDefault();
    closeMenus();
    void runAction(item.dataset.menuAction);
  };

  const onDocumentPointerDown = (event) => {
    if (!(event.target instanceof Node) || !topMenu.contains(event.target)) {
      closeMenus();
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      if (openMenu) {
        event.preventDefault();
        closeMenus();
      }
      return;
    }

    const action = shortcutToAction(event);
    if (!action) {
      return;
    }

    event.preventDefault();
    closeMenus();
    void runAction(action);
  };

  async function runAction(action) {
    try {
      switch (action) {
        case "new":
          store.mutate((state) => {
            state.timeline = createDefaultTimeline();
            state.filePath = null;
            state.playhead = 0;
            state.dirty = false;
          });
          showNotice("New project");
          return;
        case "open":
          await openProject();
          return;
        case "save":
          await saveProject();
          return;
        case "saveAs":
          await saveProjectAs();
          return;
        case "close":
          store.mutate((state) => {
            state.timeline = createDefaultTimeline();
            state.filePath = null;
            state.playhead = 0;
            state.dirty = false;
          });
          showNotice("Project closed");
          return;
        case "export":
          showNotice("Export is not implemented yet", { dirty: store.state.dirty });
          await logInfo(bridge, "Export requested but not implemented yet");
          return;
        case "undo":
        case "redo":
        case "cut":
        case "copy":
        case "paste":
          showNotice(`${placeholderLabel(action)} is not implemented yet`, {
            dirty: store.state.dirty,
          });
          await logInfo(bridge, `${placeholderLabel(action)} requested but not implemented yet`);
          return;
        case "zoomIn":
          store.mutate((state) => {
            state.ui.zoom = Math.min(2, normalizeZoom(state.ui?.zoom) + 0.1);
          });
          return;
        case "zoomOut":
          store.mutate((state) => {
            state.ui.zoom = Math.max(0.5, normalizeZoom(state.ui?.zoom) - 0.1);
          });
          return;
        case "zoomFit":
          store.mutate((state) => {
            state.ui.zoom = 1;
          });
          return;
        case "toggleTimeline":
          store.mutate((state) => {
            state.ui.timelineVisible = state.ui?.timelineVisible === false;
          });
          return;
        case "toggleInspector":
          store.mutate((state) => {
            state.ui.inspectorVisible = state.ui?.inspectorVisible === false;
          });
          return;
        default:
          throw new Error(`Unknown menu action: ${action}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showNotice("Action failed", { dirty: store.state.dirty });
      window.alert(message);
    }
  }

  async function openProject() {
    const dialog = await bridge.call("fs.dialogOpen", { filters: [".nfproj"] });
    const path = readDialogPath(dialog);
    if (!path) {
      return;
    }

    const file = await bridge.call("fs.read", { path });
    const parsed = JSON.parse(String(file?.contents ?? ""));
    const validation = validateTimeline(parsed);

    if (!validation.ok) {
      throw new Error(validation.errors.join("\n"));
    }

    store.mutate((state) => {
      state.timeline = normalizeTimeline(parsed);
      state.filePath = path;
      state.playhead = 0;
      state.dirty = false;
    });
    showNotice(`Opened ${basename(path) ?? DEFAULT_SAVE_NAME}`);
  }

  async function saveProject() {
    const path = store.state.filePath;
    if (!path) {
      await saveProjectAs();
      return;
    }

    await writeProject(path);
    showNotice(`Saved ${basename(path) ?? DEFAULT_SAVE_NAME}`);
  }

  async function saveProjectAs() {
    const dialog = await bridge.call("fs.dialogSave", {
      defaultName: suggestFileName(store.state.filePath),
    });
    const path = readDialogPath(dialog);
    if (!path) {
      return;
    }

    await writeProject(path);
    showNotice(`Saved ${basename(path) ?? DEFAULT_SAVE_NAME}`);
  }

  async function writeProject(path) {
    const contents = JSON.stringify(store.state.timeline, null, 2);
    await bridge.call("fs.write", { path, contents });
    store.mutate((state) => {
      state.filePath = path;
      state.dirty = false;
    });
  }

  topMenu.addEventListener("click", onClick);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  window.addEventListener("keydown", onKeyDown);
  render(store.state);

  return {
    destroy() {
      window.clearTimeout(noticeTimer);
      unsubscribe();
      topMenu.removeEventListener("click", onClick);
      document.removeEventListener("pointerdown", onDocumentPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      closeMenus();
    },
  };
}

function normalizeTimeline(timeline) {
  return {
    ...timeline,
    background: typeof timeline.background === "string" ? timeline.background : DEFAULT_BACKGROUND,
    tracks: Array.isArray(timeline.tracks) ? timeline.tracks : [],
  };
}

function readDialogPath(result) {
  if (typeof result === "string" && result.length > 0) {
    return result;
  }

  if (typeof result?.path === "string" && result.path.length > 0) {
    return result.path;
  }

  return null;
}

function suggestFileName(filePath) {
  const fileName = basename(filePath);
  return fileName && fileName.endsWith(".nfproj") ? fileName : DEFAULT_SAVE_NAME;
}

function shortcutToAction(event) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey) {
    return null;
  }

  const key = event.key.toLowerCase();
  if (key === "s") {
    return event.shiftKey ? "saveAs" : "save";
  }

  if (event.shiftKey) {
    return null;
  }

  if (key === "n") {
    return "new";
  }

  if (key === "o") {
    return "open";
  }

  return null;
}

function syncCheckmark(name, checked) {
  const item = document.querySelector(`[data-menu-check="${name}"]`);
  const check = item?.querySelector(".menu-check");
  if (item) {
    item.dataset.checked = checked ? "true" : "false";
  }

  if (check) {
    check.textContent = checked ? "✓" : "";
  }
}

function placeholderLabel(action) {
  switch (action) {
    case "undo":
      return "Undo";
    case "redo":
      return "Redo";
    case "cut":
      return "Cut";
    case "copy":
      return "Copy";
    case "paste":
      return "Paste";
    default:
      return action;
  }
}

function normalizeZoom(value) {
  const zoom = Number(value);
  return Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
}

function basename(filePath) {
  if (typeof filePath !== "string" || filePath.length === 0) {
    return null;
  }

  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function formatSeconds(value) {
  const total = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

async function logInfo(bridge, msg) {
  try {
    await bridge.call("log", { level: "info", msg });
  } catch {
    // Ignore logging failures in browser-only previews.
  }
}
