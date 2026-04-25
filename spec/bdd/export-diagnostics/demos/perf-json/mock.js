export const demo = {
  title: "STRUCTURED EXPORT DIAGNOSTICS",
  subtitle: "导出完成时，MP4 旁边落一份 JSON。AI 直接读 slow_spans、top_frames、avg_ms_per_frame，不再翻 raw log。",
  stage: "record.done -> diagnostics.json",
  metrics: [
    ["24.0s", "duration_ms"],
    ["720", "frames"],
    ["42ms", "avg_ms_per_frame"],
    ["3", "slow_spans"]
  ],
  spans: [
    ["ok", "3%", "18%"],
    ["", "23%", "22%"],
    ["warn", "58%", "17%"],
    ["ok", "80%", "12%"]
  ]
};
