export const command = "nf verify --project v2-showcase --composition showreel-24s";
export const checks = [
  ["ok", "schema.compile", "composition compiled"],
  ["ok", "component.abi", "9 used components"],
  ["warn", "layout.missing", "stage-bg has no x/y"],
  ["warn", "text.long", "subtitle-main needs screenshot review"]
];
