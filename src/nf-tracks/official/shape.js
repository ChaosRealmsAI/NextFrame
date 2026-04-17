// Official Track: shape. Renders a simple rect. Zero imports.

export function describe() {
  return {
    kind: "track",
    name: "shape",
    params: {
      kind: { type: "enum", values: ["rect", "circle"], default: "rect" },
      x: { type: "number", default: 0 },
      y: { type: "number", default: 0 },
      w: { type: "number", default: 100 },
      h: { type: "number", default: 100 },
      fill: { type: "string", default: "#000" },
    },
  };
}

export function sample() {
  return { kind: "rect", x: 0.25, y: 0.25, w: 0.5, h: 0.5, fill: "#38bdf8" };
}

export function render(_t, keyframes, viewport) {
  const props = (keyframes && keyframes[0]) || sample();
  return {
    dom: {
      tag: "div",
      style: {
        position: "absolute",
        left: `${props.x * viewport.w}px`,
        top: `${props.y * viewport.h}px`,
        width: `${props.w * viewport.w}px`,
        height: `${props.h * viewport.h}px`,
        background: props.fill,
        borderRadius: props.kind === "circle" ? "50%" : "0",
      },
    },
  };
}
