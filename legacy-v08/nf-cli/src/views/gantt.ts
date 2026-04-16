// ASCII Gantt renderer — adapted from POC W2.
// Renders a Timeline as 80-col ASCII showing tracks/clips/markers/chapters.

const MAX_WIDTH = 80;
const MIN_CHART_WIDTH = 32;
const DESIRED_TICKS = 10;

interface NormClip { id: string; label: string; start: number; end: number }
interface NormTrack { id: string; clips: NormClip[]; markers: never[] }
interface NormChapter { id: string; label: string; start: number; end: number }
interface NormMarker { id: string; label: string; time: number }
interface NormTimeline { title: string; duration: number; tracks: NormTrack[]; chapters: NormChapter[]; markers: NormMarker[]; clipCount: number }
interface Layout { trackLabelWidth: number; rightLabelWidth: number; chartWidth: number }

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function truncate(text: unknown, w: number): string {
  const s = String(text ?? "");
  if (w <= 0) return "";
  if (s.length <= w) return s;
  if (w <= 3) return s.slice(0, w);
  return `${s.slice(0, w - 3)}...`;
}

function padRight(text: unknown, w: number): string {
  return truncate(text, w).padEnd(w, " ");
}

function fmtTime(seconds: number, withTenths: boolean): string {
  const safe = Math.max(0, Number(seconds) || 0);
  if (withTenths) {
    const tenths = Math.round(safe * 10);
    const m = Math.floor(tenths / 600);
    const rem = tenths % 600;
    const s = Math.floor(rem / 10);
    const t = rem % 10;
    return `${m}:${String(s).padStart(2, "0")}.${t}`;
  }
  const r = Math.round(safe);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
}

/**
 * Render an 80-col ASCII Gantt for a resolved Timeline.
 * @param {object} timeline - Timeline with raw seconds (post-resolveTimeline)
 * @returns {string} ASCII gantt
 */
export function renderGantt(timeline: Record<string, unknown>): string {
  const norm = normalize(timeline);
  const layout = createLayout(norm);
  const ticks = buildTicks(norm.duration, pickTickStep(norm.duration));
  const lines = [
    summaryLine(norm),
    ...chapterLines(norm, layout),
    ...axisLines(norm, layout, ticks),
    ...trackLines(norm, layout),
  ];
  return lines.join("\n");
}

function normalize(timeline: Record<string, unknown>): NormTimeline {
  const title = (timeline.title as string) || (timeline.project as Record<string, unknown> | undefined)?.name as string || "NextFrame Project";
  const duration = Number.isFinite(timeline.duration) && (timeline.duration as number) > 0 ? timeline.duration as number : 1;

  const tracks = ((timeline.tracks || []) as Record<string, unknown>[]).map((trk, i) => {
    const id = String(trk.id || `T${i + 1}`);
    const clips = ((trk.clips || []) as Record<string, unknown>[])
      .map((clip, ci) => {
        const start = typeof clip.start === "number" ? clip.start : 0;
        const dur = typeof clip.dur === "number" ? clip.dur : 0;
        return {
          id: (clip.id as string) || `clip-${ci + 1}`,
          label: String(clip.scene || clip.id || `clip-${ci + 1}`),
          start: clamp(start, 0, duration),
          end: clamp(start + dur, start, duration),
        };
      })
      .sort((a, b) => a.start - b.start);
    return { id, clips, markers: [] as never[] };
  });

  const chapters = ((timeline.chapters || []) as Record<string, unknown>[])
    .map((c, i) => ({
    id: (c.id as string) || `chapter-${i + 1}`,
    label: (c.name as string) || (c.id as string) || `chapter-${i + 1}`,
    start: clamp(typeof c.start === "number" ? c.start : 0, 0, duration),
    end: clamp(typeof c.end === "number" ? c.end : duration, 0, duration)
  }))
    .sort((a, b) => a.start - b.start);

  const markers = ((timeline.markers || []) as Record<string, unknown>[]).map((m, i) => ({
    id: (m.id as string) || `marker-${i + 1}`,
    label: (m.name as string) || (m.id as string) || `marker-${i + 1}`,
    time: clamp(typeof m.t === "number" ? m.t : 0, 0, duration)
  }));

  const clipCount = tracks.reduce((a, t) => a + t.clips.length, 0);

  return { title, duration, tracks, chapters, markers, clipCount };
}

function summaryLine(t: NormTimeline): string {
  const suffix = ` · ${fmtTime(t.duration, true)} · ${t.tracks.length} tracks · ${t.clipCount} clips · ${t.chapters.length} chapters`;
  const avail = Math.max(8, MAX_WIDTH - suffix.length);
  return `${truncate(t.title, avail)}${suffix}`;
}

function createLayout(t: NormTimeline): Layout {
  const trackLabelWidth = clamp(
    Math.max(4, ...t.tracks.map((tr) => String(tr.id).length)),
    4,
    6
  );
  const sideLabel = clamp(
    Math.max(0, ...t.tracks.flatMap((tr) => tr.clips.map((c) => c.label.length))),
    0,
    16
  );
  const prefixWidth = trackLabelWidth + 1;
  const maxRight = Math.max(0, MAX_WIDTH - prefixWidth - MIN_CHART_WIDTH - 1);
  const rightLabelWidth = Math.min(sideLabel, maxRight);
  const chartWidth = MAX_WIDTH - prefixWidth - (rightLabelWidth > 0 ? rightLabelWidth + 1 : 0);
  return { trackLabelWidth, rightLabelWidth, chartWidth };
}

function pickTickStep(duration: number): number {
  const target = duration / DESIRED_TICKS;
  const cands: number[] = [];
  for (let e = -2; e <= 5; e++) {
    const base = 10 ** e;
    for (const m of [1, 2, 2.5, 5, 10, 15, 20, 30]) cands.push(base * m);
  }
  let best = cands[0];
  let bestScore = Infinity;
  for (const c of cands) {
    if (c <= 0) continue;
    const tickCount = duration / c;
    const dPenalty = Math.abs(tickCount - DESIRED_TICKS);
    const sPenalty = Math.abs(c - target) / Math.max(target, 0.001);
    const score = dPenalty * 4 + sPenalty;
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

function buildTicks(duration: number, step: number): number[] {
  const ticks = [0];
  const eps = step / 1000;
  for (let t = step; t < duration - eps; t += step) {
    ticks.push(Number(t.toFixed(6)));
  }
  if (ticks[ticks.length - 1] !== duration) ticks.push(duration);
  return ticks;
}

function posFor(t: number, duration: number, w: number): number {
  if (w <= 1 || duration <= 0) return 0;
  return clamp(Math.round((t / duration) * (w - 1)), 0, w - 1);
}

function place(buf: string[], start: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    const p = start + i;
    if (p >= 0 && p < buf.length) buf[p] = text[i];
  }
}

function compose(left: string, chart: string[], layout: Layout, right: string): string {
  const l = `${padRight(left, layout.trackLabelWidth)} `;
  const r = layout.rightLabelWidth > 0 ? ` ${padRight(right || "", layout.rightLabelWidth)}` : "";
  return `${l}${chart.join("")}${r}`;
}

function chapterLines(t: NormTimeline, layout: Layout): string[] {
  if (t.chapters.length === 0) return [];
  const labels = new Array<string>(layout.chartWidth).fill(" ");
  const bounds = new Array<string>(layout.chartWidth).fill(" ");
  for (const ch of t.chapters) {
    const s = posFor(ch.start, t.duration, layout.chartWidth);
    const e = posFor(ch.end, t.duration, layout.chartWidth);
    const span = Math.max(1, e - s + 1);
    const text = truncate(ch.label, span);
    const center = clamp(
      s + Math.floor((span - text.length) / 2),
      s,
      Math.max(s, e - text.length + 1)
    );
    place(labels, center, text);
    bounds[s] = "┃";
  }
  bounds[layout.chartWidth - 1] = "┃";
  return [compose("", labels, layout, ""), compose("", bounds, layout, "")];
}

interface TickPlacement { i: number; start: number; end: number; label: string }

function axisLines(t: NormTimeline, layout: Layout, ticks: number[]): string[] {
  const showTenths = t.duration <= 10 || ticks.some((tk, i) => i > 0 && tk % 1 !== 0);
  const labels = new Array<string>(layout.chartWidth).fill(" ");
  const ruler = new Array<string>(layout.chartWidth).fill("─");
  const placements: TickPlacement[] = ticks.map((tk, i) => {
    const p = posFor(tk, t.duration, layout.chartWidth);
    const lbl = fmtTime(tk, showTenths);
    let s = p - Math.floor(lbl.length / 2);
    if (i === 0) s = 0;
    else if (i === ticks.length - 1) s = layout.chartWidth - lbl.length;
    s = clamp(s, 0, Math.max(0, layout.chartWidth - lbl.length));
    return { i, start: s, end: s + lbl.length - 1, label: lbl };
  });
  const sel: TickPlacement[] = [placements[0]];
  const last = placements[placements.length - 1];
  for (let i = 1; i < placements.length - 1; i++) {
    const c = placements[i];
    const prev = sel[sel.length - 1];
    if (c.start > prev.end + 1 && c.end < last.start - 1) sel.push(c);
  }
  if (last.i !== placements[0].i) sel.push(last);
  ticks.forEach((tk, i) => {
    const p = posFor(tk, t.duration, layout.chartWidth);
    if (i === 0) ruler[p] = "├";
    else if (i === ticks.length - 1) ruler[p] = "┤";
    else ruler[p] = "┼";
  });
  sel.forEach((p) => place(labels, p.start, p.label));
  return [compose("", labels, layout, ""), compose("", ruler, layout, "")];
}

function drawClip(buf: string[], clip: NormClip, t: NormTimeline, layout: Layout): void {
  const s = posFor(clip.start, t.duration, layout.chartWidth);
  const e = Math.max(s, posFor(clip.end, t.duration, layout.chartWidth));
  for (let i = s; i <= e; i++) buf[i] = "▓";
}

function trackLines(t: NormTimeline, layout: Layout): string[] {
  const lines: string[] = [];
  for (const trk of t.tracks) {
    let leftLabel = trk.id;
    if (trk.clips.length === 0) {
      lines.push(compose(leftLabel, new Array<string>(layout.chartWidth).fill(" "), layout, ""));
      continue;
    }
    for (const clip of trk.clips) {
      const row = new Array<string>(layout.chartWidth).fill(" ");
      drawClip(row, clip, t, layout);
      lines.push(compose(leftLabel, row, layout, clip.label));
      leftLabel = "";
    }
  }
  if (t.markers.length > 0) {
    let lbl = "MARK";
    for (const m of t.markers) {
      const row = new Array<string>(layout.chartWidth).fill(" ");
      const p = posFor(m.time, t.duration, layout.chartWidth);
      row[p] = "▲";
      lines.push(compose(lbl, row, layout, m.label));
      lbl = "";
    }
  }
  return lines;
}
