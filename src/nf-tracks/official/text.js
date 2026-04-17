// Official Track: text. Zero external imports. Pure render.

export function describe() {
  return {
    kind: "track",
    name: "text",
    params: {
      content: { type: "string", default: "" },
      x: { type: "number", default: 0 },
      y: { type: "number", default: 0 },
      fontSize: { type: "number", default: 48 },
      color: { type: "string", default: "#fff" },
    },
  };
}

export function sample() {
  return {
    content: "Hello, NextFrame",
    x: 0.5,
    y: 0.5,
    fontSize: 64,
    color: "#ffffff",
  };
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
        color: props.color,
        fontSize: `${props.fontSize}px`,
      },
      text: props.content,
    },
  };
}
