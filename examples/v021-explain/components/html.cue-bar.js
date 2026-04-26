const cueBarInstances = new WeakMap();

export function mount(root, ctx) {
  if (!root) return;
  const doc = root.ownerDocument || document;
  root.innerHTML = "";

  const frame = doc.createElement("div");
  frame.className = "cue-bar";
  frame.style.position = "absolute";
  frame.style.inset = "0";
  frame.style.width = "100%";
  frame.style.height = "100%";
  frame.style.overflow = "hidden";
  frame.style.pointerEvents = "none";

  const bar = doc.createElement("div");
  bar.className = "cue-bar-inner";
  bar.style.position = "absolute";
  bar.style.left = "0";
  bar.style.right = "0";
  bar.style.bottom = "0";
  bar.style.height = "12%";
  bar.style.display = "flex";
  bar.style.alignItems = "center";
  bar.style.justifyContent = "center";
  bar.style.padding = "0 72px";
  bar.style.overflow = "hidden";
  bar.style.background = "#0a0c10";
  bar.style.borderTop = "1px solid #1a1a22";
  bar.style.boxSizing = "border-box";

  const line = doc.createElement("div");
  line.className = "cue-bar-line";
  line.style.display = "flex";
  line.style.alignItems = "baseline";
  line.style.justifyContent = "center";
  line.style.maxWidth = "100%";
  line.style.whiteSpace = "nowrap";
  line.style.overflow = "hidden";
  line.style.fontFamily = '"PingFang SC", "Noto Sans CJK SC", "Noto Sans CJK", -apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", Arial, sans-serif';
  line.style.fontWeight = "600";
  line.style.letterSpacing = "0.04em";

  bar.appendChild(line);
  frame.appendChild(bar);
  root.appendChild(frame);

  cueBarInstances.set(root, {
    line,
    currentCue: null,
    spans: [],
  });
  update(root, ctx);
}

export function update(root, ctx) {
  if (!root) return;
  let instance = cueBarInstances.get(root);
  if (!instance) {
    mount(root, ctx);
    instance = cueBarInstances.get(root);
    if (!instance) return;
  }

  const params = ctx && typeof ctx === "object" && ctx.params && typeof ctx.params === "object" ? ctx.params : {};
  const cues = Array.isArray(params.cues) ? params.cues : [];
  // Cues are clip-local (0-based per slide). Use ctx.localTimeMs when the runtime
  // is rendering inside a multi-clip composition; fall back to ctx.timeMs for the
  // legacy single-clip case where local and global coincide.
  const timeMs = finiteNumber(
    ctx && (typeof ctx.localTimeMs === "number" ? ctx.localTimeMs : ctx.timeMs),
    0,
  );
  const sizePx = finiteNumber(params.size_px, 38);
  const cue = currentCue(cues, timeMs);

  instance.line.style.fontSize = `${Math.max(1, sizePx)}px`;

  if (instance.currentCue !== cue) {
    instance.currentCue = cue;
    instance.spans = [];
    instance.line.replaceChildren();
    if (cue) renderCue(instance, cue, root.ownerDocument || document);
  }

  for (const item of instance.spans) {
    item.span.style.color = item.endMs <= timeMs ? "#fbbf24" : "rgba(255,255,255,0.6)";
  }
}

export function destroy(root) {
  if (!root) return;
  cueBarInstances.delete(root);
  root.innerHTML = "";
}

function renderCue(instance, cue, doc) {
  const words = Array.isArray(cue.words) && cue.words.length > 0
    ? cue.words
    : [{ text: typeof cue.text === "string" ? cue.text : "", end_ms: cue.end_ms }];
  for (const word of words) {
    const span = doc.createElement("span");
    span.textContent = typeof word.text === "string" ? word.text : "";
    span.style.display = "inline-block";
    span.style.color = "rgba(255,255,255,0.6)";
    span.style.transition = "color 0.08s linear";
    instance.line.appendChild(span);
    instance.spans.push({
      span,
      endMs: finiteNumber(word.end_ms, Number.POSITIVE_INFINITY),
    });
  }
}

function currentCue(cues, timeMs) {
  for (const cue of cues) {
    if (!cue || typeof cue !== "object") continue;
    const startMs = finiteNumber(cue.start_ms, Number.POSITIVE_INFINITY);
    const endMs = finiteNumber(cue.end_ms, Number.NEGATIVE_INFINITY);
    if (startMs <= timeMs && timeMs < endMs) return cue;
  }
  return null;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
