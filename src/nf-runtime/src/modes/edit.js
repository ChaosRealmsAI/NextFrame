// Edit mode — freeze t, re-render on source change. Walking stub.

export function startEdit() {
  let t = 0;
  return {
    mode: "edit",
    freezeAt(time) {
      t = time;
    },
    currentT() {
      return t;
    },
  };
}
