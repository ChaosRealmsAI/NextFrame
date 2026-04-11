import { clearAutosave } from "./autosave.js";
import { validateTimeline } from "./engine/index.js";
import { showExportDialog } from "./export/dialog.js";
import { createProjectDocument, readProjectDocument } from "./project/document.js";
import { findAspectPresetForProject } from "./project/presets.js";
import { createDefaultProjectState, createDefaultTimeline } from "./store.js";
import { THEMES } from "./theme.js";
import { toast } from "./toast.js";

const DEFAULT_SAVE_NAME = "Untitled.nfproj";
const DEFAULT_STATUS = "Ready";
const DEFAULT_BACKGROUND = "#0b0b14";
const OPEN_RECENT_LABEL = "Open Recent";

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
  const zoomLabel = document.getElementById("preview-zoom-label");
  const timeDisplay = document.querySelector(".time-display");
  const previewSlot = document.getElementById("preview-stage-slot");
  const timelinePanel = document.getElementById("bottom-timeline");
  const timelineStats = document.getElementById("timeline-stats");
  const timelineSplitter = document.getElementById("timeline-splitter");
  const inspectorPanel = document.getElementById("right-inspector");
  const inspectorSplitter = document.getElementById("inspector-splitter");
  const revealProjectItem = topMenu.querySelector('[data-menu-action="revealProject"]');
  const recentMenuList = topMenu.querySelector("[data-menu-recent-list]");

  let openMenu = null;
  let noticeTimer = 0;
  let recentEntries = [];
  let recentMenuRequestId = 0;

  const render = (state) => {
    const isDirty = Boolean(state.dirty);
    const isSnapEnabled = state.snapEnabled !== false;
    const zoom = normalizeZoom(state.ui?.zoom);
    const isTimelineVisible = state.ui?.timelineVisible !== false;
    const isInspectorVisible = state.ui?.inspectorVisible !== false;
    const themeName = typeof state.theme === "string" && Object.prototype.hasOwnProperty.call(THEMES, state.theme)
      ? state.theme
      : "default";
    const aspectPresetId = findAspectPresetForProject(state.project)?.id ?? "";

    if (statusChip) {
      statusChip.classList.toggle("is-dirty", isDirty);
    }

    if (statusLabel) {
      statusLabel.textContent = isDirty ? "Modified" : DEFAULT_STATUS;
    }

    if (revealProjectItem instanceof HTMLButtonElement) {
      revealProjectItem.disabled = !state.filePath;
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

    if (timelineStats) {
      timelineStats.hidden = !isTimelineVisible;
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

    syncCheckmark("snapEnabled", isSnapEnabled);
    syncCheckmark("timelineVisible", isTimelineVisible);
    syncCheckmark("inspectorVisible", isInspectorVisible);
    syncRadioSelection("theme", themeName);
    syncRadioSelection("aspectPreset", aspectPresetId);
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

    if (name === "file") {
      void refreshRecentMenu();
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
    void runAction(item.dataset.menuAction, item.dataset);
  };

  const onDocumentPointerDown = (event) => {
    if (!(event.target instanceof Node) || !topMenu.contains(event.target)) {
      closeMenus();
    }
  };

  const onKeyDown = (event) => {
    if (
      !event.defaultPrevented
      && !event.metaKey
      && !event.ctrlKey
      && !event.altKey
      && !event.shiftKey
      && event.key.toLowerCase() === "s"
      && !isEditableTarget(event.target)
    ) {
      event.preventDefault();
      closeMenus();
      void runAction("toggleSnap");
      return;
    }

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

  function renderRecentMenu() {
    if (!(recentMenuList instanceof HTMLElement)) {
      return;
    }

    const fragment = document.createDocumentFragment();
    const entries = recentEntries.slice(0, 10);

    if (entries.length === 0) {
      fragment.append(
        createRecentMenuItem({
          label: "No Recent Files",
          disabled: true,
        }),
      );
    } else {
      for (const entry of entries) {
        fragment.append(
          createRecentMenuItem({
            action: "openRecent",
            label: entry.name || basename(entry.path) || entry.path,
            path: entry.path,
          }),
        );
      }
    }

    fragment.append(createMenuDivider());
    fragment.append(
      createRecentMenuItem({
        action: "clearRecent",
        label: "Clear Menu",
        disabled: entries.length === 0,
      }),
    );
    recentMenuList.replaceChildren(fragment);
  }

  async function refreshRecentMenu() {
    if (!(recentMenuList instanceof HTMLElement)) {
      return;
    }

    const requestId = ++recentMenuRequestId;

    try {
      const result = await bridge.call("recent.list", {});
      if (requestId !== recentMenuRequestId) {
        return;
      }

      recentEntries = Array.isArray(result)
        ? result
          .filter((entry) => typeof entry?.path === "string" && entry.path.length > 0)
          .slice(0, 10)
        : [];
    } catch (error) {
      if (requestId !== recentMenuRequestId) {
        return;
      }

      recentEntries = [];
      void logInfo(
        bridge,
        `${OPEN_RECENT_LABEL} refresh failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    renderRecentMenu();
  }

  async function rememberRecentProject(path) {
    try {
      await bridge.call("recent.add", { path });
    } catch (error) {
      await logInfo(
        bridge,
        `recent.add failed for ${path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async function runAction(action, detail = {}) {
    try {
      switch (action) {
        case "new":
          store.mutate((state) => {
            state.timeline = createDefaultTimeline();
            state.project = createDefaultProjectState();
            state.assets = [];
            state.assetBuffers = new Map();
            state.filePath = null;
            state.playhead = 0;
            state.dirty = false;
          });
          showNotice("New project");
          toast("New project");
          return;
        case "open":
          await openProject();
          return;
        case "openRecent":
          await openProjectAtPath(detail.menuRecentPath);
          return;
        case "save":
          await saveProject();
          return;
        case "saveAs":
          await saveProjectAs();
          return;
        case "clearRecent":
          await clearRecentMenu();
          return;
        case "close":
          store.mutate((state) => {
            state.timeline = createDefaultTimeline();
            state.project = createDefaultProjectState();
            state.assets = [];
            state.assetBuffers = new Map();
            state.filePath = null;
            state.playhead = 0;
            state.dirty = false;
          });
          showNotice("Project closed");
          return;
        case "export":
          await showExportDialog({ store });
          return;
        case "cut":
        case "copy":
        case "paste":
          showNotice(`${placeholderLabel(action)} is not implemented yet`, {
            dirty: store.state.dirty,
          });
          await logInfo(bridge, `${placeholderLabel(action)} requested but not implemented yet`);
          return;
        case "undo":
          if (store.canUndo) {
            store.undo();
          } else {
            showNotice("Nothing to undo", { dirty: store.state.dirty });
          }
          return;
        case "redo":
          if (store.canRedo) {
            store.redo();
          } else {
            showNotice("Nothing to redo", { dirty: store.state.dirty });
          }
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
        case "revealProject":
          await revealProject();
          return;
        case "toggleSnap":
          store.mutate((state) => {
            state.snapEnabled = state.snapEnabled === false;
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
        case "setTheme":
          if (!Object.prototype.hasOwnProperty.call(THEMES, detail.menuTheme)) {
            throw new Error(`Unknown theme: ${detail.menuTheme ?? ""}`);
          }

          store.mutate((state) => {
            state.theme = detail.menuTheme;
          });
          return;
        case "setAspectPreset":
          if (typeof store?.dispatch !== "function") {
            return;
          }

          store.dispatch({
            type: "setProjectAspectPreset",
            presetId: detail.menuAspectPreset,
          });
          return;
        default:
          throw new Error(`Unknown menu action: ${action}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showNotice("Action failed", { dirty: store.state.dirty });
      toast(message, { type: "error" });
    }
  }

  async function openProject() {
    const dialog = await bridge.call("fs.dialogOpen", { filters: [".nfproj"] });
    const path = readDialogPath(dialog);
    if (!path) {
      return;
    }

    await openProjectAtPath(path);
  }

  async function openProjectAtPath(path) {
    if (typeof path !== "string" || path.length === 0) {
      return;
    }

    const parsed = await bridge.call("timeline.load", { path });
    const projectDocument = readProjectDocument(parsed);
    const validation = validateTimeline(projectDocument.timeline);

    if (!validation.ok) {
      throw new Error(validation.errors.join("\n"));
    }

    store.mutate((state) => {
      const timeline = normalizeTimeline(projectDocument.timeline);
      state.timeline = timeline;
      state.project = projectDocument.project;
      state.assets = timeline.assets;
      state.assetBuffers = new Map();
      state.filePath = path;
      state.playhead = 0;
      state.dirty = false;
    });
    await rememberRecentProject(path);
    showNotice(`Opened ${basename(path) ?? DEFAULT_SAVE_NAME}`);
    toast(`Opened ${basename(path) ?? DEFAULT_SAVE_NAME}`);
  }

  async function saveProject() {
    const path = store.state.filePath;
    if (!path) {
      await saveProjectAs();
      return;
    }

    await writeProject(path);
    showNotice(`Saved ${basename(path) ?? DEFAULT_SAVE_NAME}`);
    toast("Saved.", { type: "success" });
  }

  async function saveProjectAs() {
    const dialog = await bridge.call("fs.dialogSave", {
      defaultName: DEFAULT_SAVE_NAME,
    });
    const path = readDialogPath(dialog);
    if (!path) {
      return;
    }

    await writeProject(path);
    showNotice(`Saved ${basename(path) ?? DEFAULT_SAVE_NAME}`);
    toast("Saved.", { type: "success" });
  }

  async function writeProject(path) {
    const autosaveId = store.state.autosaveId;
    const contents = JSON.stringify(createProjectDocument(store.state), null, 2);
    await bridge.call("fs.write", { path, contents });
    store.mutate((state) => {
      state.filePath = path;
      state.dirty = false;
    });
    if (typeof autosaveId === "string" && autosaveId.length > 0) {
      void clearAutosave({ bridge, projectId: autosaveId }).catch((error) =>
        logInfo(
          bridge,
          `autosave.clear failed for ${autosaveId}: ${error instanceof Error ? error.message : String(error)}`,
        )
      );
    }
    await rememberRecentProject(path);
  }

  async function clearRecentMenu() {
    await bridge.call("recent.clear", {});
    recentEntries = [];
    renderRecentMenu();
    showNotice("Recent projects cleared", { dirty: store.state.dirty });
  }

  async function revealProject() {
    const path = store.state.filePath;
    if (!path) {
      return;
    }

    await bridge.call("fs.reveal", { path });
  }

  topMenu.addEventListener("click", onClick);
  document.addEventListener("pointerdown", onDocumentPointerDown);
  window.addEventListener("keydown", onKeyDown);
  renderRecentMenu();
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

function createRecentMenuItem({ action = "", label, path = "", disabled = false }) {
  const item = document.createElement("button");
  item.className = "menu-item";
  item.type = "button";
  item.role = "menuitem";
  item.disabled = disabled;

  if (action) {
    item.dataset.menuAction = action;
  }

  if (path) {
    item.dataset.menuRecentPath = path;
  }

  item.append(createMenuSpan("menu-check"));
  item.append(createMenuSpan("", label));
  item.append(createMenuSpan("menu-shortcut"));
  return item;
}

function createMenuDivider() {
  const divider = document.createElement("div");
  divider.className = "menu-divider";
  divider.role = "separator";
  return divider;
}

function createMenuSpan(className, text = "") {
  const span = document.createElement("span");
  if (className) {
    span.className = className;
  }
  span.textContent = text;
  return span;
}

function normalizeTimeline(timeline) {
  return {
    ...timeline,
    background: typeof timeline.background === "string" ? timeline.background : DEFAULT_BACKGROUND,
    assets: Array.isArray(timeline.assets) ? timeline.assets : [],
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

function isEditableTarget(target) {
  return target instanceof HTMLElement
    && (
      target.isContentEditable
      || target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
    );
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

function syncRadioSelection(name, value) {
  const items = [...document.querySelectorAll(`[data-menu-radio="${name}"]`)];
  for (const item of items) {
    const checked = item instanceof HTMLElement && item.dataset.menuValue === value;
    if (item instanceof HTMLElement) {
      item.dataset.checked = checked ? "true" : "false";
      item.setAttribute("aria-checked", checked ? "true" : "false");
    }

    const check = item?.querySelector(".menu-check");
    if (check) {
      check.textContent = checked ? "•" : "";
    }
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
