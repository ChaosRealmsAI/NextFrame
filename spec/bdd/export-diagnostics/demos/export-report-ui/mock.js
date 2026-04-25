export const demo = {
  title: "导出结果带诊断摘要",
  subtitle: "导出成功后，右侧不是只给一个文件路径。你会看到总耗时、平均帧耗时、慢区间数量和 diagnostics report 路径。",
  stage: "export.status succeeded",
  metrics: [
    ["done", "export status"],
    ["42ms", "avg frame"],
    ["3 spans", "slow count"],
    ["json", "report ready"]
  ],
  spans: [
    ["ok", "4%", "20%"],
    ["warn", "30%", "8%"],
    ["", "45%", "22%"],
    ["warn", "74%", "12%"]
  ]
};
