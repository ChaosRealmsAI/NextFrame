// TODO: implement deterministic behavior scheduling helpers
const meta = { name: "scheduler", kind: "engine", description: "Scheduler helpers stub" };
function stagger(items = [], opts = {}) { return { items, opts, mode: "stagger" }; }
function loop(track = [], opts = {}) { return { track, opts, mode: "loop" }; }
function yoyo(track = [], opts = {}) { return { track, opts, mode: "yoyo" }; }
export { meta, stagger, loop, yoyo };
