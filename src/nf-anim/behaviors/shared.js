export const p = (name, type, value, semantic) => ({ name, type, default: value, semantic });
export const at = (startAt, duration, step = 1) => Number((startAt + duration * step).toFixed(4));
export const metaOf = (name, category, description, duration, params = [], example = {}) => ({
  name,
  category,
  description,
  default_duration: duration,
  params: [
    p("startAt", "number", 0, "when behavior starts (sec)"),
    p("duration", "number", duration, "how long it runs (sec)"),
    ...params,
  ],
  examples: [{ startAt: 0, duration, ...example }],
});
