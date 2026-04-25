export const demo = {
  kicker: "V-02 · CLI",
  title: "一条命令校验组件 ABI",
  command: "nf composition validate --project=v2-showcase --composition=showreel-24s",
  lines: [
    "$ NEXTFRAME_HOME=examples target/debug/nf composition validate ...",
    "{ \"ok\": true, \"errors\": [] }",
    "exports.mount=true · exports.update=true",
    "params: title, subtitle, x, y, density, energy",
    "exit 0"
  ],
  metrics: [
    ["available", "13"],
    ["used", "9"],
    ["errors", "0"],
    ["warnings", "0"]
  ]
};
