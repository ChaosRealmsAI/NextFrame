import { CLIP_LABEL_ORDER } from "./clip-labels.js";
import { batchCommand, setClipFieldCommand, splitClipCommand } from "./commands.js";
import { toast } from "./toast.js";
import { MIN_CLIP_DURATION, getClipDuration } from "./timeline/clip-range.js";
import {
  addTrack,
  copyClipIds,
  cutClipIds,
  duplicateClipIds,
  getSelectedClipIds,
  hasClipboardClips,
  pasteClipboardClips,
  removeClipIds,
} from "./workspace-actions.js";

const STYLE_ID = "nextframe-context-menu-style";
const MOUNT_KEY = Symbol.for("nextframe.context-menu.mount");
const ROOT_KEY = Symbol.for("nextframe.context-menu.root");
const PANEL_WIDTH = 200;
const VIEWPORT_MARGIN = 8;

function installStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .context-menu-root {
      position: fixed;
      inset: 0;
      z-index: 170;
      pointer-events: none;
    }

    .context-menu-panel {
      width: ${PANEL_WIDTH}px;
      display: grid;
      gap: 2px;
      padding: 6px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      background:
        linear-gradient(180deg, rgba(21, 24, 34, 0.98), rgba(11, 15, 24, 0.98));
      box-shadow: 0 18px 42px rgba(0, 0, 0, 0.38);
      pointer-events: auto;
    }

    .context-menu-panel:not(.context-menu-submenu) {
      position: absolute;
    }

    .context-menu-item,
    .context-menu-submenu-trigger {
      min-height: 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 10px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: rgba(241, 245, 249, 0.96);
      font: inherit;
      font-size: 13px;
      text-align: left;
      cursor: pointer;
    }

    .context-menu-item:hover:not(:disabled),
    .context-menu-item:focus-visible:not(:disabled),
    .context-menu-item-group:hover > .context-menu-submenu-trigger,
    .context-menu-item-group:focus-within > .context-menu-submenu-trigger {
      background: rgba(96, 165, 250, 0.18);
      outline: none;
    }

    .context-menu-item:disabled,
    .context-menu-submenu-trigger:disabled {
      color: rgba(148, 163, 184, 0.6);
      cursor: default;
    }

    .context-menu-divider {
      height: 1px;
      margin: 4px 2px;
      background: rgba(148, 163, 184, 0.18);
    }

    .context-menu-item-label {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .context-menu-item-meta {
      flex: 0 0 auto;
      color: rgba(148, 163, 184, 0.9);
      font-size: 13px;
    }

    .context-menu-item-group {
      position: relative;
    }

    .context-menu-submenu {
      position: absolute;
      top: -6px;
      left: calc(100% - 4px);
      display: none;
    }

    .context-menu-root.is-submenu-left .context-menu-submenu {
      left: auto;
      right: calc(100% - 4px);
    }

    .context-menu-item-group:hover > .context-menu-submenu,
    .context-menu-item-group:focus-within > .context-menu-submenu {
      display: grid;
    }
  `;

  document.head.append(style);
}

function uniqueClipIds(clipIds) {
  const ids = [];
  const seen = new Set();

  (Array.isArray(clipIds) ? clipIds : []).forEach((clipId) => {
    if (clipId == null) {
      return;
    }

    const normalized = String(clipId);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    ids.push(normalized);
  });

  return ids;
}

function getTrackById(state, trackId) {
  return (state?.timeline?.tracks || []).find((track) => track?.id === trackId) ?? null;
}

function findClipEntry(state, clipId, preferredTrackId = null) {
  const tracks = Array.isArray(state?.timeline?.tracks) ? state.timeline.tracks : [];

  if (preferredTrackId) {
    const track = tracks.find((candidate) => candidate?.id === preferredTrackId);
    const clip = track?.clips?.find((candidate) => candidate?.id === clipId);
    if (track && clip) {
      return { track, clip };
    }
  }

  for (const track of tracks) {
    const clip = track?.clips?.find((candidate) => candidate?.id === clipId);
    if (clip) {
      return { track, clip };
    }
  }

  return null;
}

function getClipTrackIds(state, clipIds) {
  return uniqueClipIds(clipIds)
    .map((clipId) => findClipEntry(state, clipId)?.track?.id ?? null)
    .filter(Boolean);
}

function canSplitClipAtPlayhead(state, clipId) {
  const entry = findClipEntry(state, clipId);
  if (!entry?.clip) {
    return false;
  }

  const playhead = Number(state?.playhead) || 0;
  const clipStart = Number(entry.clip.start) || 0;
  const clipEnd = clipStart + getClipDuration(entry.clip);

  return playhead > clipStart
    && playhead < clipEnd
    && playhead - clipStart >= MIN_CLIP_DURATION
    && clipEnd - playhead >= MIN_CLIP_DURATION;
}

function ensureInspectorVisible(store) {
  if (typeof store?.mutate === "function" && store.state?.ui?.inspectorVisible === false) {
    store.mutate((state) => {
      state.ui = {
        ...state.ui,
        inspectorVisible: true,
      };
    });
  }

  document.getElementById("right-inspector")?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
}

function updateSelection(store, { clipId = null, clipIds = [], trackId = null } = {}) {
  if (clipIds.length > 1 && typeof store?.selectClips === "function") {
    store.selectClips(clipIds, { clipId, trackId });
    return;
  }

  if (clipId && typeof store?.selectClip === "function") {
    store.selectClip(clipId);
    return;
  }

  if (typeof store?.clearSelection === "function") {
    store.clearSelection({ trackId });
    return;
  }

  if (typeof store?.dispatch === "function") {
    store.dispatch({
      type: "setSelection",
      trackId,
      clipId,
      clipIds,
    });
  }
}

function resolveClipContext(store, clipId, trackId) {
  const selectedClipIds = getSelectedClipIds(store);
  const isInSelection = selectedClipIds.includes(clipId);
  const clipIds = isInSelection ? selectedClipIds : [clipId];

  updateSelection(store, {
    trackId,
    clipId,
    clipIds,
  });

  return {
    clipId,
    trackId,
    clipIds,
  };
}

function buildLabelItems(store, clipIds) {
  const currentClips = uniqueClipIds(clipIds)
    .map((clipId) => findClipEntry(store?.state, clipId)?.clip)
    .filter(Boolean);

  return [
    {
      label: "None",
      disabled: currentClips.length > 0 && currentClips.every((clip) => !clip?.label),
      onSelect() {
        store.dispatch?.(batchCommand(
          uniqueClipIds(clipIds).map((clipId) => setClipFieldCommand({
            clipId,
            field: "label",
            value: undefined,
          })),
        ));
      },
    },
    ...CLIP_LABEL_ORDER.map((label) => ({
      label: label.slice(0, 1).toUpperCase() + label.slice(1),
      disabled: currentClips.length > 0 && currentClips.every((clip) => clip?.label === label),
      onSelect() {
        store.dispatch?.(batchCommand(
          uniqueClipIds(clipIds).map((clipId) => setClipFieldCommand({
            clipId,
            field: "label",
            value: label,
          })),
        ));
      },
    })),
  ];
}

function buildClipMenu(store, context) {
  const clipTrackIds = new Set(getClipTrackIds(store?.state, context.clipIds));
  const canDuplicate = clipTrackIds.size === 1;
  const canSplit = context.clipIds.some((clipId) => canSplitClipAtPlayhead(store?.state, clipId));
  const splitTime = Number(store?.state?.playhead) || 0;

  return [
    {
      label: "Cut",
      onSelect() {
        cutClipIds(store, context.clipIds);
      },
    },
    {
      label: "Copy",
      onSelect() {
        copyClipIds(store, context.clipIds);
      },
    },
    {
      label: "Duplicate",
      disabled: !canDuplicate,
      onSelect() {
        duplicateClipIds(store, context.clipIds);
      },
    },
    {
      label: "Delete",
      onSelect() {
        removeClipIds(store, context.clipIds);
      },
    },
    { separator: true },
    {
      label: "Split at Playhead",
      disabled: !canSplit,
      onSelect() {
        store.dispatch?.(batchCommand(
          context.clipIds.map((clipId) => splitClipCommand({
            clipId,
            splitTime,
          })),
        ));
      },
    },
    {
      label: "Assign Label",
      submenu: buildLabelItems(store, context.clipIds),
    },
    { separator: true },
    {
      label: "Show Properties",
      onSelect() {
        updateSelection(store, {
          trackId: context.trackId,
          clipId: context.clipId,
          clipIds: context.clipIds,
        });
        ensureInspectorVisible(store);
      },
    },
  ];
}

function buildTimelineMenu(store, context) {
  const track = getTrackById(store?.state, context.trackId);
  const trackKind = track?.kind === "audio" ? "audio" : "video";
  const canPaste = hasClipboardClips() && Boolean(context.trackId);

  return [
    {
      label: "Paste",
      disabled: !canPaste,
      onSelect() {
        pasteClipboardClips(store, {
          trackId: context.trackId,
          targetStart: Number(store?.state?.playhead) || 0,
        });
      },
    },
    {
      label: "Add Track",
      onSelect() {
        addTrack(store, trackKind);
      },
    },
    {
      label: "Zoom Fit",
      onSelect() {
        const button = document.querySelector('#bottom-timeline [data-action="fit"]');
        if (button instanceof HTMLButtonElement) {
          button.click();
        }
      },
    },
  ];
}

function buildLibraryMenu(store, context) {
  const canFavorite = Boolean(context.sceneId)
    && typeof store?.isFavorite === "function"
    && !store.isFavorite(context.sceneId);
  const dragTarget = context.assetKind === "audio"
    ? "audio track"
    : "timeline lane";

  return [
    {
      label: "Add to Favorites",
      disabled: !canFavorite,
      onSelect() {
        store.toggleFavorite?.(context.sceneId);
      },
    },
    {
      label: "Drag Hint",
      onSelect() {
        toast(`Drag this card into a ${dragTarget} to add it.`, { type: "info" });
      },
    },
  ];
}

function createMenuButton(item, closeMenu) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "context-menu-item";
  button.disabled = Boolean(item.disabled);

  const label = document.createElement("span");
  label.className = "context-menu-item-label";
  label.textContent = item.label;

  button.append(label);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (button.disabled) {
      return;
    }

    closeMenu();
    item.onSelect?.();
  });

  return button;
}

function createSubmenuTrigger(item) {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "context-menu-submenu-trigger";
  trigger.setAttribute("aria-haspopup", "menu");

  const label = document.createElement("span");
  label.className = "context-menu-item-label";
  label.textContent = item.label;

  const arrow = document.createElement("span");
  arrow.className = "context-menu-item-meta";
  arrow.textContent = "▸";

  trigger.append(label, arrow);
  trigger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });

  return trigger;
}

function createPanel(items, closeMenu) {
  const panel = document.createElement("div");
  panel.className = "context-menu-panel";
  panel.setAttribute("role", "menu");

  items.forEach((item) => {
    if (item?.separator) {
      const divider = document.createElement("div");
      divider.className = "context-menu-divider";
      divider.setAttribute("role", "separator");
      panel.append(divider);
      return;
    }

    if (Array.isArray(item?.submenu)) {
      const group = document.createElement("div");
      group.className = "context-menu-item-group";
      group.append(
        createSubmenuTrigger(item),
        createPanel(item.submenu, closeMenu),
      );
      group.lastElementChild?.classList.add("context-menu-submenu");
      panel.append(group);
      return;
    }

    panel.append(createMenuButton(item, closeMenu));
  });

  return panel;
}

function positionRoot(root, clientX, clientY) {
  const panel = root.querySelector(".context-menu-panel");
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - panel.offsetWidth - VIEWPORT_MARGIN);
  const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - panel.offsetHeight - VIEWPORT_MARGIN);
  root.classList.toggle("is-submenu-left", clientX > window.innerWidth - ((PANEL_WIDTH * 2) + VIEWPORT_MARGIN));
  panel.style.left = `${Math.min(Math.max(clientX, VIEWPORT_MARGIN), maxLeft)}px`;
  panel.style.top = `${Math.min(Math.max(clientY, VIEWPORT_MARGIN), maxTop)}px`;
}

function resolveMenuTarget(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  const clipEl = target.closest(".timeline-clip");
  if (clipEl instanceof HTMLElement) {
    const row = clipEl.closest(".timeline-track-row");
    return {
      type: "clip",
      clipId: clipEl.dataset.clipId || null,
      trackId: row instanceof HTMLElement ? row.dataset.trackId || null : null,
    };
  }

  const lane = target.closest(".timeline-track-lane");
  if (lane instanceof HTMLElement) {
    const row = lane.closest(".timeline-track-row");
    return {
      type: "timeline-empty",
      trackId: row instanceof HTMLElement ? row.dataset.trackId || null : null,
    };
  }

  const card = target.closest(".asset-card");
  if (card instanceof HTMLElement) {
    return {
      type: "library-card",
      sceneId: card.dataset.sceneId || null,
      assetKind: card.dataset.assetKind || "",
    };
  }

  return null;
}

function createMenuSpec(store, target) {
  if (!target) {
    return null;
  }

  if (target.type === "clip" && target.clipId) {
    return buildClipMenu(store, resolveClipContext(store, target.clipId, target.trackId));
  }

  if (target.type === "timeline-empty") {
    return buildTimelineMenu(store, target);
  }

  if (target.type === "library-card") {
    return buildLibraryMenu(store, target);
  }

  return null;
}

export function mountContextMenu({ store } = {}) {
  if (!(document.body instanceof HTMLElement)) {
    throw new TypeError("mountContextMenu({ store }) requires document.body");
  }

  if (!store || typeof store !== "object") {
    throw new TypeError("mountContextMenu({ store }) requires a store");
  }

  document[MOUNT_KEY]?.destroy?.();
  installStyles();

  let openRoot = null;
  let teardownOpenMenu = () => {};

  function closeMenu() {
    teardownOpenMenu();
    teardownOpenMenu = () => {};
    if (openRoot instanceof HTMLElement) {
      openRoot.remove();
    }
    openRoot = null;
    delete document.body[ROOT_KEY];
  }

  function openMenu(items, clientX, clientY) {
    closeMenu();

    const root = document.createElement("div");
    root.className = "context-menu-root";
    root.append(createPanel(items, closeMenu));
    document.body.append(root);
    positionRoot(root, clientX, clientY);

    const handlePointerDown = (event) => {
      if (!(event.target instanceof Node) || !root.contains(event.target)) {
        closeMenu();
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
      }
    };
    const handleScroll = () => {
      closeMenu();
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("scroll", handleScroll, true);

    teardownOpenMenu = () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("scroll", handleScroll, true);
    };

    openRoot = root;
    document.body[ROOT_KEY] = root;
  }

  function handleContextMenu(event) {
    if (openRoot && event.target instanceof Node && openRoot.contains(event.target)) {
      event.preventDefault();
      return;
    }

    const target = resolveMenuTarget(event.target);
    const items = createMenuSpec(store, target);
    if (!items || items.length === 0) {
      closeMenu();
      return;
    }

    event.preventDefault();
    openMenu(items, event.clientX, event.clientY);
  }

  document.addEventListener("contextmenu", handleContextMenu);

  const destroy = () => {
    closeMenu();
    document.removeEventListener("contextmenu", handleContextMenu);
    if (document[MOUNT_KEY]?.destroy === destroy) {
      delete document[MOUNT_KEY];
    }
  };

  document[MOUNT_KEY] = { destroy };
  return destroy;
}
