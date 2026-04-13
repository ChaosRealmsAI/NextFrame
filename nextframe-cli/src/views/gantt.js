export function renderGantt(timeline, width = 72) {
  const duration = Math.max(0.001, Number(timeline?.duration) || 1);
  const lines = [
    `Timeline ${duration.toFixed(2)}s`,
    `MARK ${renderMarkers(timeline?.markers || [], duration, width)}`,
  ];

  for (const layer of (timeline?.layers || []).slice().sort((a, b) => Number(a.start) - Number(b.start))) {
    const bar = new Array(width).fill(" ");
    const start = Math.max(0, Math.min(width - 1, Math.floor((Number(layer.start) / duration) * width)));
    const end = Math.max(start + 1, Math.min(width, Math.ceil(((Number(layer.start) + Number(layer.dur)) / duration) * width)));
    for (let index = start; index < end; index++) {
      bar[index] = index === start ? "[" : index === end - 1 ? "]" : "=";
    }
    lines.push(`${String(layer.id).padEnd(12)} ${bar.join("")} ${layer.scene}`);
  }

  return lines.join("\n");
}

function renderMarkers(markers, duration, width) {
  const bar = new Array(width).fill(" ");
  for (const marker of markers) {
    const position = Math.max(0, Math.min(width - 1, Math.floor((Number(marker.t) / duration) * width)));
    bar[position] = "|";
  }
  return bar.join("");
}
