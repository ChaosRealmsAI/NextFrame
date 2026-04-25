export const demo = {
  title: "24 秒性能地图",
  subtitle: "时间轴不是只显示进度。慢区间直接染成 warning，点一下就能看到开始时间、结束时间和每帧耗时。",
  stage: "selected span 18.6s-20.1s",
  metrics: [
    ["18.6s", "span start"],
    ["20.1s", "span end"],
    ["132ms", "peak frame"],
    ["2.4x", "over budget"]
  ],
  spans: [
    ["ok", "2%", "24%"],
    ["", "32%", "18%"],
    ["warn", "64%", "10%"],
    ["", "78%", "16%"]
  ]
};
