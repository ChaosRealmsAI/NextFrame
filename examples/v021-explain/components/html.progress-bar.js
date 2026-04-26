const progressBarInstances = new WeakMap();

export function mount(root, ctx) {
  if (!root) return;
  const doc = root.ownerDocument || document;
  root.innerHTML = "";

  const outer = doc.createElement("div");
  outer.className = "progress-bar";
  outer.style.position = "absolute";
  outer.style.left = "0";
  outer.style.right = "0";
  outer.style.top = "0";
  outer.style.width = "100%";
  outer.style.height = "4px";
  outer.style.overflow = "hidden";
  outer.style.pointerEvents = "none";
  outer.style.background = "#2a2a32";

  const fill = doc.createElement("div");
  fill.className = "progress-bar-fill";
  fill.style.width = "0%";
  fill.style.height = "100%";
  fill.style.background = "#a78bfa";
  fill.style.transition = "width 0.05s linear";

  outer.appendChild(fill);
  root.appendChild(outer);
  progressBarInstances.set(root, { outer, fill });
  update(root, ctx);
}

export function update(root, ctx) {
  if (!root) return;
  let instance = progressBarInstances.get(root);
  if (!instance) {
    mount(root, ctx);
    instance = progressBarInstances.get(root);
    if (!instance) return;
  }

  const params = ctx && typeof ctx === "object" && ctx.params && typeof ctx.params === "object" ? ctx.params : {};
  const color = nonEmptyString(params.color, "#a78bfa");
  const trackColor = nonEmptyString(params.track_color, "#2a2a32");
  const timeMs = finiteNumber(ctx && ctx.timeMs, 0);
  const durationMs = finiteNumber(ctx && ctx.durationMs, 0);
  const progress = durationMs > 0 ? clamp(timeMs / durationMs, 0, 1) : 0;

  instance.outer.style.background = trackColor;
  instance.fill.style.background = color;
  instance.fill.style.width = `${progress * 100}%`;
}

export function destroy(root) {
  if (!root) return;
  progressBarInstances.delete(root);
  root.innerHTML = "";
}

function nonEmptyString(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
