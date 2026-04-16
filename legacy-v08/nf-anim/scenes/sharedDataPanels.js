import {
  barGrow,
  base,
  box,
  chartOf,
  chartReveal,
  clamp,
  compareOf,
  countUp,
  dataOf,
  fadeIn,
  itemOf,
  LANDS,
  mapPin,
  pieFill,
  pinOf,
  popIn,
  slideInUp,
  txt,
  vpOf,
  WARM,
  withScene,
} from "./sharedDataCore.js";

export function makeStatBig(metaIn, sample) {
  return withScene(metaIn, sample, (t, params, vp) => {
    void t;
    const [W, H, S] = vpOf(vp);
    const accent = params.color || WARM.accent;
    const data = chartOf(params.data, sample.data).slice(0, 4);
    const main = data[0];
    const rest = data.slice(1, 4);
    const layers = [
      ...base(W, H),
      box(W / 2, H * 0.45, W * 0.76, H * 0.44, WARM.panel, {
        opacity: 0.96,
        behaviors: [fadeIn(0, 0.5)],
      }),
      {
        shape: "circle",
        at: [W * 0.19, H * 0.25],
        radius: S * 0.035,
        fill: accent,
        opacity: 0.9,
        behaviors: [popIn(0.12, 0.45)],
      },
      txt(W / 2, H * 0.31, main.label, S * 0.032, WARM.muted, {
        behaviors: [fadeIn(0.1, 0.5)],
      }),
      txt(W / 2, H * 0.46, `${main.value}${main.suffix}`, S * 0.13, WARM.text, {
        behaviors: [
          countUp(0.2, 1.1, { value: main.value }),
          slideInUp(0.12, 0.6, { distance: S * 0.04 }),
        ],
      }),
    ];

    rest.forEach((item, i) => {
      const x = W * (0.25 + (i * 0.25));
      const y = H * 0.73;
      const start = 0.45 + (i * 0.14);

      layers.push(
        box(x, y, W * 0.2, H * 0.16, WARM.card, {
          behaviors: [slideInUp(start, 0.6, { distance: 28 }), fadeIn(start, 0.45)],
        }),
        txt(x, y - H * 0.03, `${item.value}${item.suffix}`, S * 0.048, [accent, WARM.gold, WARM.sand][i], {
          behaviors: [countUp(start, 0.9, { value: item.value })],
        }),
        txt(x, y + H * 0.032, item.label, S * 0.023, WARM.muted, {
          behaviors: [fadeIn(start + 0.08, 0.45)],
        }),
      );
    });

    return { duration: metaIn.duration_hint, size: [W, H], layers };
  });
}

export function makeComparison(metaIn, sample) {
  return withScene(metaIn, sample, (t, params, vp) => {
    void t;
    const [W, H, S] = vpOf(vp);
    const rows = compareOf(params.data, sample.data).slice(0, 3);
    const leftMax = Math.max(...rows.map((r) => r.left), 1);
    const rightMax = Math.max(...rows.map((r) => r.right), 1);
    const cols = [
      {
        key: "left",
        title: "Before",
        x: W * 0.28,
        color: params.color || WARM.accent,
        max: leftMax,
      },
      {
        key: "right",
        title: "After",
        x: W * 0.72,
        color: WARM.gold,
        max: rightMax,
      },
    ];
    const layers = [...base(W, H)];

    cols.forEach((col, j) => {
      const start = 0.12 + (j * 0.15);
      const total = rows.reduce((sum, row) => sum + row[col.key], 0);

      layers.push(
        box(col.x, H * 0.48, W * 0.32, H * 0.56, WARM.panel, {
          behaviors: [slideInUp(start, 0.6, { distance: 32 }), fadeIn(start, 0.45)],
        }),
        txt(col.x, H * 0.18, col.title, S * 0.03, WARM.muted, {
          behaviors: [fadeIn(start, 0.4)],
        }),
        txt(col.x, H * 0.29, `${Math.round(total)}`, S * 0.082, col.color, {
          behaviors: [countUp(start + 0.08, 0.9, { value: Math.round(total) })],
        }),
      );

      rows.forEach((row, i) => {
        const value = row[col.key];
        const width = (W * 0.21 * value) / col.max;
        const y = H * (0.42 + (i * 0.13));
        const rowStart = start + 0.18 + (i * 0.1);

        layers.push(
          txt(col.x, y - H * 0.045, row.label, S * 0.022, WARM.muted, {
            behaviors: [fadeIn(rowStart, 0.3)],
          }),
          {
            shape: "bar",
            at: [col.x - (W * 0.06), y],
            width,
            height: H * 0.042,
            fill: col.color,
            tracks: { scaleX: [[rowStart, 0.04], [rowStart + 0.7, 1, "out"]] },
            behaviors: [barGrow(rowStart, 0.7, { percent: value }), fadeIn(rowStart, 0.25)],
          },
          txt(col.x + W * 0.09, y, `${value}`, S * 0.025, WARM.text, {
            behaviors: [countUp(rowStart + 0.08, 0.6, { value })],
          }),
        );
      });
    });

    return { duration: metaIn.duration_hint, size: [W, H], layers };
  });
}

export function makeProgressRing(metaIn, sample) {
  return withScene(metaIn, sample, (t, params, vp) => {
    void t;
    const [W, H, S] = vpOf(vp);
    const accent = params.color || WARM.accent;
    const item = itemOf(dataOf(params.data, sample.data)[0], 0, sample.data[0].value);
    const target = clamp(item.value, 0, 100);
    const cx = W / 2;
    const cy = H * 0.5;
    const radius = S * 0.22;
    const layers = [
      ...base(W, H),
      txt(cx, H * 0.16, item.label, S * 0.034, WARM.muted, {
        behaviors: [fadeIn(0.05, 0.5)],
      }),
      {
        shape: "ring",
        at: [cx, cy],
        radius,
        strokeWidth: S * 0.045,
        stroke: WARM.line,
        opacity: 0.7,
        behaviors: [fadeIn(0.08, 0.5)],
      },
      {
        shape: "pie",
        at: [cx, cy],
        value: target,
        radius,
        fill: accent,
        behaviors: [pieFill(0.2, 1.1, { percent: target })],
      },
      { shape: "circle", at: [cx, cy], radius: radius - (S * 0.06), fill: WARM.bg },
      txt(cx, cy - S * 0.015, `${Math.round(target)}%`, S * 0.09, WARM.text, {
        behaviors: [countUp(0.25, 1.05, { value: Math.round(target) })],
      }),
      txt(cx, cy + S * 0.075, item.suffix || "completion", S * 0.022, WARM.muted, {
        behaviors: [fadeIn(0.42, 0.4)],
      }),
    ];

    return { duration: metaIn.duration_hint, size: [W, H], layers };
  });
}

export function makeKpiGrid(metaIn, sample) {
  return withScene(metaIn, sample, (t, params, vp) => {
    void t;
    const [W, H, S] = vpOf(vp);
    const data = chartOf(params.data, sample.data).slice(0, 4);
    const colors = [params.color || WARM.accent, WARM.gold, WARM.sand, WARM.clay];
    const layers = [
      ...base(W, H),
      txt(W * 0.2, H * 0.12, "KPI Snapshot", S * 0.032, WARM.muted, {
        behaviors: [fadeIn(0, 0.45)],
      }),
    ];

    data.forEach((item, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = W * (0.31 + (col * 0.38));
      const y = H * (0.36 + (row * 0.28));
      const start = 0.18 + (i * 0.12);

      layers.push(
        box(x, y, W * 0.28, H * 0.2, WARM.panel, {
          behaviors: [slideInUp(start, 0.55, { distance: 26 }), fadeIn(start, 0.4)],
        }),
        {
          shape: "rect",
          at: [x, y - H * 0.07],
          width: W * 0.28,
          height: H * 0.014,
          fill: colors[i],
          opacity: 0.9,
          behaviors: [fadeIn(start + 0.05, 0.3)],
        },
        txt(x, y - H * 0.015, item.label, S * 0.024, WARM.muted, {
          behaviors: [fadeIn(start + 0.06, 0.35)],
        }),
        txt(x, y + H * 0.04, `${item.value}${item.suffix}`, S * 0.06, colors[i], {
          behaviors: [countUp(start + 0.1, 0.8, { value: item.value })],
        }),
      );
    });

    return { duration: metaIn.duration_hint, size: [W, H], layers };
  });
}

export function makeDataMap(metaIn, sample) {
  return withScene(metaIn, sample, (t, params, vp) => {
    void t;
    const [W, H, S] = vpOf(vp);
    const pins = dataOf(params.data, sample.data).slice(0, 5).map(pinOf);
    const layers = [
      ...base(W, H),
      txt(W * 0.18, H * 0.12, "Global Distribution", S * 0.032, WARM.muted, {
        behaviors: [fadeIn(0, 0.45)],
      }),
      box(W / 2, H * 0.54, W * 0.82, H * 0.58, WARM.panel, {
        opacity: 0.92,
        behaviors: [fadeIn(0.05, 0.45)],
      }),
    ];

    LANDS.forEach((points) => {
      layers.push({
        shape: "polygon",
        at: [W / 2, H * 0.54],
        points: points.map(([x, y]) => [x * (W / 1280), y * (H / 720)]),
        fill: "none",
        stroke: WARM.line,
        strokeWidth: Math.max(2, S * 0.0035),
        opacity: 0.9,
        behaviors: [chartReveal(0.12, 1.1, { data: pins })],
      });
    });

    pins.forEach((pin, i) => {
      const start = 0.3 + (i * 0.14);
      const x = W * (0.09 + (pin.x * 0.82));
      const y = H * (0.25 + (pin.y * 0.46));

      layers.push(
        {
          shape: "drop",
          at: [x, y],
          scale: 0.35,
          fill: i % 2 ? WARM.gold : (params.color || WARM.accent),
          behaviors: [mapPin(start, 0.75, { value: pin.value })],
        },
        {
          shape: "circle",
          at: [x, y + S * 0.03],
          radius: S * 0.01,
          fill: WARM.sand,
          opacity: 0.85,
          behaviors: [fadeIn(start + 0.1, 0.25)],
        },
        txt(x, y - S * 0.04, pin.label, S * 0.02, WARM.text, {
          behaviors: [fadeIn(start + 0.12, 0.35)],
        }),
      );
    });
    return { duration: metaIn.duration_hint, size: [W, H], layers };
  });
}
