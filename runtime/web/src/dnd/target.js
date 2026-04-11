import { readDragPayload } from "./source.js";

function acceptsPayload(accepts, payload) {
  return Array.isArray(accepts)
    && accepts.length > 0
    && typeof payload?.type === "string"
    && accepts.includes(payload.type);
}

export function registerDropTarget(el, { accepts = [], canAccept = null, onDrop } = {}) {
  if (!(el instanceof HTMLElement)) {
    throw new TypeError("registerDropTarget(el, options) requires an element");
  }

  if (typeof onDrop !== "function") {
    throw new TypeError("registerDropTarget(el, options) requires onDrop(payload, event)");
  }

  let dragDepth = 0;

  const activate = () => {
    el.classList.add("drop-accept");
  };

  const deactivate = () => {
    dragDepth = 0;
    el.classList.remove("drop-accept");
  };

  const resolveAcceptedPayload = (event) => {
    const payload = readDragPayload(event.dataTransfer);
    if (!acceptsPayload(accepts, payload)) {
      return null;
    }

    if (typeof canAccept === "function" && !canAccept(payload, event)) {
      return null;
    }

    return payload;
  };

  const handleDragEnter = (event) => {
    const payload = resolveAcceptedPayload(event);
    if (!payload) {
      deactivate();
      return;
    }

    dragDepth += 1;
    event.preventDefault();
    activate();
  };

  const handleDragOver = (event) => {
    const payload = resolveAcceptedPayload(event);
    if (!payload) {
      deactivate();
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "copy";
    }
    activate();
  };

  const handleDragLeave = () => {
    if (!el.classList.contains("drop-accept")) {
      return;
    }

    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      deactivate();
    }
  };

  const handleDrop = (event) => {
    const payload = resolveAcceptedPayload(event);
    if (!payload) {
      deactivate();
      return;
    }

    event.preventDefault();
    deactivate();
    onDrop(payload, event);
  };

  el.addEventListener("dragenter", handleDragEnter);
  el.addEventListener("dragover", handleDragOver);
  el.addEventListener("dragleave", handleDragLeave);
  el.addEventListener("drop", handleDrop);

  return () => {
    deactivate();
    el.removeEventListener("dragenter", handleDragEnter);
    el.removeEventListener("dragover", handleDragOver);
    el.removeEventListener("dragleave", handleDragLeave);
    el.removeEventListener("drop", handleDrop);
  };
}
