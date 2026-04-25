export const demo = {
  kicker: "V-03 · blocked",
  title: "坏组件不会静默进预览/导出",
  before: "export function mount(root) {}\n\n// update 缺失",
  after: "{\n  \"ok\": false,\n  \"errors\": [\n    \"component 'html.hero-title' missing export function update\"\n  ]\n}",
  exit: "exit 2 · validation failed"
};
