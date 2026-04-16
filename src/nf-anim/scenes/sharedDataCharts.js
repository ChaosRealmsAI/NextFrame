import {
  barGrow,
  base,
  chartOf,
  chartReveal,
  countUp,
  fadeIn,
  lineDraw,
  nodeReveal,
  pieFill,
  popIn,
  txt,
  vpOf,
  WARM,
  withScene,
} from "./sharedDataCore.js";

export function makeBarChart(metaIn, sample) {
  return withScene(metaIn, sample, (t, params, vp) => {
    void t;

    const [W, H, S] = vpOf(vp);
    const accent = params.color || WARM.accent;
    const data = chartOf(params.data, sample.data).slice(0, 6);
    const max = Math.max(...data.map((d) => d.value), 1);
    const left = W * 0.14;
    const right = W * 0.9;
    const top = H * 0.2;
    const baseY = H * 0.77;
    const step = (right - left) / data.length;
    const bw = Math.min(step * 0.54, W * 0.09);
    const layers = [
      ...base(W, H),
      txt(W * 0.22, H * 0.12, "Category Performance", S * 0.032, WARM.muted, {
        behaviors: [fadeIn(0, 0.5)],
      }),
      {
        shape: "rect",
        at: [(left + right) / 2, baseY],
        width: right - left,
        height: 3,
        fill: WARM.line,
        opacity: 0.8,
        behaviors: [chartReveal(0.1, 1.2, { data })],
      },
      {
        shape: "rect",
        at: [left, (top + baseY) / 2],
        width: 3,
        height: baseY - top,
        fill: WARM.line,
        opacity: 0.8,
        behaviors: [chartReveal(0.1, 1.2, { data })],
      },
    ];

    data.forEach((item, i) => {
      const h = ((baseY - top) * item.value) / max;
      const x = left + (step * i) + (step / 2);
      const start = 0.28 + (i * 0.12);

      layers.push(
        {
          shape: "bar",
          at: [x, baseY - (h / 2)],
          width: bw,
          height: h,
          fill: [accent, WARM.gold, WARM.clay, WARM.sand][i % 4],
          tracks: { scaleY: [[start, 0.02], [start + 0.9, 1, "out"]] },
          behaviors: [barGrow(start, 0.9, { percent: item.value }), fadeIn(start, 0.4)],
        },
        txt(x, baseY + H * 0.06, item.label, S * 0.022, WARM.muted, {
          behaviors: [fadeIn(start + 0.05, 0.35)],
        }),
        txt(x, baseY - h - H * 0.04, `${item.value}${item.suffix}`, S * 0.024, WARM.text, {
          behaviors: [countUp(start + 0.1, 0.7, { value: item.value })],
        }),
      );
    });

    return { duration: metaIn.duration_hint, size: [W, H], layers };
  });
}

export function makeLineChart(metaIn, sample) {
  return withScene(metaIn, sample, (t, params, vp) => {
    void t;

    const [W, H, S] = vpOf(vp);
    const accent = params.color || WARM.accent;
    const data = chartOf(params.data, sample.data).slice(0, 7);
    const max = Math.max(...data.map((d) => d.value), 1);
    const left = W * 0.13;
    const right = W * 0.88;
    const top = H * 0.2;
    const baseY = H * 0.76;
    const step = (right - left) / Math.max(1, data.length - 1);
    const points = data.map((item, i) => [
      left + (step * i),
      baseY - (((baseY - top) * item.value) / max),
    ]);
    const layers = [
      ...base(W, H),
      txt(W * 0.2, H * 0.12, "Signal Trend", S * 0.032, WARM.muted, {
        behaviors: [fadeIn(0, 0.5)],
      }),
      {
        shape: "rect",
        at: [(left + right) / 2, baseY],
        width: right - left,
        height: 3,
        fill: WARM.line,
        opacity: 0.75,
        behaviors: [chartReveal(0.1, 1.2, { data })],
      },
      {
        shape: "rect",
        at: [left, (top + baseY) / 2],
        width: 3,
        height: baseY - top,
        fill: WARM.line,
        opacity: 0.75,
        behaviors: [chartReveal(0.1, 1.2, { data })],
      },
      {
        shape: "line",
        at: [0, 0],
        points,
        stroke: accent,
        strokeWidth: Math.max(6, S * 0.01),
        opacity: 0.95,
        behaviors: [lineDraw(0.2, 1.2, { data })],
      },
    ];

    points.slice(1).forEach((point, i) => {
      layers.push({
        shape: "line",
        at: [0, 0],
        points: [points[i], point],
        stroke: [accent, WARM.gold, WARM.sand][i % 3],
        strokeWidth: Math.max(5, S * 0.008),
        opacity: 0.9,
        behaviors: [fadeIn(0.28 + (i * 0.15), 0.35)],
      });
    });

    points.forEach((point, i) => {
      const start = 0.45 + (i * 0.12);

      layers.push(
        {
          shape: "circle",
          at: point,
          radius: Math.max(8, S * 0.012),
          fill: i === data.length - 1 ? WARM.gold : WARM.text,
          behaviors: [popIn(start, 0.45), nodeReveal(start, 0.45, { data: data.slice(0, i + 1) })],
        },
        txt(point[0], baseY + H * 0.065, data[i].label, S * 0.021, WARM.muted, {
          behaviors: [fadeIn(start + 0.05, 0.3)],
        }),
      );
    });

    return { duration: metaIn.duration_hint, size: [W, H], layers };
  });
}

export function makePieChart(metaIn, sample) {
  return withScene(metaIn, sample, (t, params, vp) => {
    void t;

    const [W, H, S] = vpOf(vp);
    const colors = [params.color || WARM.accent, WARM.gold, WARM.sand, WARM.clay];
    const data = chartOf(params.data, sample.data).slice(0, 4);
    const total = Math.max(
      data.reduce((sum, item) => sum + Math.max(0, item.value), 0),
      1,
    );
    const cx = W * 0.33;
    const cy = H * 0.5;
    const radius = S * 0.2;
    let angle = 0;
    const layers = [
      ...base(W, H),
      txt(W * 0.24, H * 0.12, "Audience Split", S * 0.032, WARM.muted, {
        behaviors: [fadeIn(0, 0.5)],
      }),
      {
        shape: "circle",
        at: [cx, cy],
        radius: radius + (S * 0.018),
        fill: WARM.card,
        opacity: 0.85,
        behaviors: [fadeIn(0.05, 0.5)],
      },
    ];

    data.forEach((item, i) => {
      const pct = (item.value / total) * 100;
      const start = 0.2 + (i * 0.18);

      layers.push(
        {
          shape: "pie",
          at: [cx, cy],
          value: pct,
          radius,
          rotate: angle,
          fill: colors[i % colors.length],
          behaviors: [pieFill(start, 0.9, { percent: pct }), popIn(start, 0.45)],
        },
        txt(W * 0.7, H * (0.32 + (i * 0.11)), item.label, S * 0.024, WARM.text, {
          behaviors: [fadeIn(start + 0.1, 0.35)],
        }),
        txt(
          W * 0.84,
          H * (0.32 + (i * 0.11)),
          `${Math.round(pct)}%`,
          S * 0.026,
          colors[i % colors.length],
          { behaviors: [countUp(start + 0.12, 0.7, { value: Math.round(pct) })] },
        ),
      );

      angle += pct * 3.6;
    });

    return { duration: metaIn.duration_hint, size: [W, H], layers };
  });
}
