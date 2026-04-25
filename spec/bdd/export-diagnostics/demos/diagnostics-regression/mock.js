export const demo = {
  title: "诊断不破坏成片",
  subtitle: "diagnostics 只是加可观测性。最终 MP4 仍然 24 秒、有 AAC、有字幕，结束后没有 recorder/export/ffmpeg 残留。",
  stage: "mp4 + diagnostics verified",
  metrics: [
    ["24.0s", "ffprobe duration"],
    ["aac", "audio codec"],
    ["ok", "caption frame"],
    ["0", "residual process"]
  ],
  spans: [
    ["ok", "5%", "16%"],
    ["", "28%", "24%"],
    ["warn", "60%", "11%"],
    ["ok", "78%", "15%"]
  ]
};
