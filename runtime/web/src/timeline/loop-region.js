import { readLoopRegion, updateLoopRegion } from "../loop-region.js";

const STYLE_ID = "nextframe-timeline-loop-region-styles";

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .timeline-loop-region {
      position: absolute;
      inset: 0 auto 0 0;
      pointer-events: none;
      min-width: 100%;
      z-index: 2;
    }

    .timeline-loop-region__fill {
      position: absolute;
      top: 0;
      bottom: 0;
      border-radius: 999px;
      background: rgba(59, 130, 246, 0.12);
      box-shadow: inset 0 0 0 1px rgba(96, 165, 250, 0.22);
    }

    .timeline-loop-region__marker {
      position: absolute;
      top: -10px;
      width: 10px;
      height: 8px;
      padding: 0;
      border: 0;
      background: linear-gradient(180deg, #f59e0b, #ea580c);
      clip-path: polygon(50% 100%, 0 0, 100% 0);
      cursor: ew-resize;
      pointer-events: auto;
      transform: translateX(-50%);
    }

    .timeline-loop-region__marker::after {
      content: attr(data-label);
      position: absolute;
      left: 50%;
      bottom: calc(100% + 2px);
      color: rgba(255, 244, 214, 0.95);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.12em;
      transform: translateX(-50%);
    }

    .timeline-loop-region__marker:focus-visible {
      outline: 2px solid rgba(251, 191, 36, 0.6);
      outline-offset: 2px;
    }
  `;

  document.head.appendChild(style);
}

function readDuration(rulerEl) {
  return Math.max(0, Number(rulerEl.dataset.timelineDuration) || 0);
}

function readTimeFromPointer(rulerEl, event, zoom, duration) {
  const rect = rulerEl.getBoundingClientRect();
  const offset = clamp(event.clientX - rect.left, 0, Math.max(rect.width, 0));
  return clamp(zoom.pxToTime(offset), 0, duration);
}

function createMarker(label, edge) {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = "timeline-loop-region__marker";
  marker.dataset.label = label;
  marker.dataset.edge = edge;
  marker.setAttribute("aria-label", `${label} loop marker`);
  return marker;
}

export function mountLoopRegion(rulerEl, store, zoom) {
  if (!(rulerEl instanceof HTMLElement)) {
    throw new TypeError("mountLoopRegion(rulerEl, store, zoom) requires a ruler element");
  }

  if (typeof zoom?.timeToPx !== "function" || typeof zoom?.pxToTime !== "function") {
    throw new TypeError("mountLoopRegion(rulerEl, store, zoom) requires zoom time conversion helpers");
  }

  ensureStyles();

  const root = document.createElement("div");
  const fill = document.createElement("div");
  const inMarker = createMarker("I", "in");
  const outMarker = createMarker("O", "out");

  root.className = "timeline-loop-region";
  fill.className = "timeline-loop-region__fill";
  root.append(fill, inMarker, outMarker);

  let activeInteraction = null;

  const ensureMounted = () => {
    if (!rulerEl.contains(root)) {
      rulerEl.appendChild(root);
    }
  };

  const render = () => {
    ensureMounted();

    const duration = readDuration(rulerEl);
    const width = Math.max(zoom.timeToPx(duration), 1);
    const loopRegion = readLoopRegion(store?.state, { duration });
    const inOffset = clamp(zoom.timeToPx(loopRegion.in), 0, width);
    const outOffset = clamp(zoom.timeToPx(loopRegion.out), 0, width);

    root.style.width = `${width}px`;
    fill.hidden = !loopRegion.enabled || outOffset <= inOffset;
    fill.style.left = `${inOffset}px`;
    fill.style.width = `${Math.max(outOffset - inOffset, 0)}px`;
    inMarker.style.left = `${inOffset}px`;
    outMarker.style.left = `${outOffset}px`;
  };

  const cleanupInteraction = () => {
    if (!activeInteraction) {
      return;
    }

    window.removeEventListener("mousemove", activeInteraction.handleMouseMove);
    window.removeEventListener("mouseup", activeInteraction.handleMouseUp);
    document.body.style.userSelect = activeInteraction.previousUserSelect;
    document.body.style.cursor = activeInteraction.previousCursor;
    activeInteraction = null;
  };

  const startDrag = (edge, event) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    cleanupInteraction();

    const interaction = {
      previousCursor: document.body.style.cursor,
      previousUserSelect: document.body.style.userSelect,
      handleMouseMove: null,
      handleMouseUp: null,
    };

    const apply = (pointerEvent) => {
      const duration = readDuration(rulerEl);
      const nextTime = readTimeFromPointer(rulerEl, pointerEvent, zoom, duration);

      updateLoopRegion(store, (loopRegion) => {
        if (edge === "in") {
          return {
            in: Math.min(nextTime, loopRegion.out),
          };
        }

        return {
          out: Math.max(nextTime, loopRegion.in),
        };
      });
      render();
    };

    interaction.handleMouseMove = (moveEvent) => {
      apply(moveEvent);
    };

    interaction.handleMouseUp = (upEvent) => {
      apply(upEvent);
      cleanupInteraction();
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
    activeInteraction = interaction;
    window.addEventListener("mousemove", interaction.handleMouseMove);
    window.addEventListener("mouseup", interaction.handleMouseUp);
  };

  const onInMouseDown = (event) => startDrag("in", event);
  const onOutMouseDown = (event) => startDrag("out", event);

  inMarker.addEventListener("mousedown", onInMouseDown);
  outMarker.addEventListener("mousedown", onOutMouseDown);
  render();

  return {
    update({ duration } = {}) {
      if (duration != null) {
        rulerEl.dataset.timelineDuration = String(duration);
      }
      render();
    },
    destroy() {
      cleanupInteraction();
      inMarker.removeEventListener("mousedown", onInMouseDown);
      outMarker.removeEventListener("mousedown", onOutMouseDown);
      root.remove();
    },
  };
}
