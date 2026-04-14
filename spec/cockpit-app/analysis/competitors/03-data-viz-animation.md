# 数据可视化动画库调研

> 调研时间：2026-04
> 范围：适合视频制作场景的图表动画库、数据故事工具、通用动画引擎
> 关联：NextFrame 场景组件 barChartReveal / lineChart / horizontalBars / ccBigNumber / dataPulse

---

## 一、视频原生渲染（最高优先级）

这类工具的核心定位就是"用代码做视频"，动画直接输出为视频帧。

### Remotion
- **地址**：https://github.com/remotion-dev/remotion
- **Stars**：43.1k
- **定位**：React 写视频。每帧 = 一个 React 渲染快照，通过 headless Chrome 截帧合成 MP4。
- **动画质量**：电影级（任何 CSS/SVG/WebGL/Canvas 都能用）
- **输出视频**：✅ 原生。本地逐帧渲染，Lambda 可并行（1 分钟视频约 30 秒）
- **开源**：源码开放，公司商用需授权（收入 > $100 万需付费）
- **与 NextFrame 关联**：
  - 对标竞品。Remotion 是"React 做视频"，NextFrame 是"JSON 做视频"
  - Remotion 的图表集成靠 React 生态（Recharts/Nivo 等），用法复杂
  - NextFrame 场景 barChartReveal / lineChart 可以做到 Remotion 图表同等效果但门槛更低

### Motion Canvas
- **地址**：https://github.com/motion-canvas/motion-canvas
- **Stars**：18.4k
- **定位**：TypeScript + Generator 写逐帧动画，内置编辑器实时预览。偏解说/教育类视频（3Blue1Brown 风格）。
- **动画质量**：电影级（矢量动画，帧级精确控制）
- **输出视频**：✅ Canvas 2D 渲染，导出 MP4
- **开源**：MIT
- **与 NextFrame 关联**：
  - 风格参考。Motion Canvas 适合做数学/算法动画，不适合数据图表
  - 启发：帧级时间轴控制思路可借鉴到 NextFrame keyframe 设计

### Revideo
- **地址**：https://re.video/
- **Stars**：较小社区
- **定位**：Motion Canvas 的 Fork，加入了 headless 渲染 API、服务端渲染、模板系统。适合自动化视频流水线。
- **动画质量**：同 Motion Canvas（Canvas 2D）
- **输出视频**：✅ 服务端 headless 渲染，可部署为 serverless 函数
- **开源**：MIT（现已并入 Midrender 可视化编辑器）
- **与 NextFrame 关联**：
  - 架构参考。Revideo 的"模板 + headless 渲染"模式与 NextFrame JSON 驱动异曲同工

---

## 二、专业动画引擎（可配合视频输出）

自身不输出视频，但动画质量高，配合 `gsap-video-export` / puppeteer 可帧级导出。

### GSAP（GreenSock Animation Platform）
- **地址**：https://github.com/greensock/GSAP
- **Stars**：19.2k（官方 repo），实际用户量远大于此
- **定位**：最强 JS 动画引擎。时间轴控制、缓动函数、ScrollTrigger、数字滚动。Google 推荐。
- **动画质量**：电影级（时间轴精确控制，60fps 零掉帧）
- **输出视频**：⚠️ 需配合 `gsap-video-export` 工具（逐帧截图合成视频）
- **开源**：GSAP 核心免费，部分插件商用需授权
- **数据可视化能力**：
  - 数字动画（odometer/counter）：原生支持
  - Bar 进度条生长动画：stagger + eased timing
  - 不擅长"图表"本身，擅长"图表动画"（配合 D3/ECharts 使用）
- **与 NextFrame 关联**：
  - NextFrame 的 ccBigNumber（大数字）、horizontalBars（横向 bar）的动画逻辑就是 GSAP 思路的精简版
  - 启发：NextFrame 应支持 `easing` + `stagger` + `duration` 参数，对齐 GSAP 缓动体系

### Anime.js
- **地址**：https://github.com/juliangarnier/anime
- **Stars**：67.1k
- **定位**：轻量 JS 动画库，语法简洁。支持 CSS/SVG/DOM/JS 属性动画。
- **动画质量**：流畅（但不如 GSAP 精细）
- **输出视频**：❌ 无原生支持（需外部截帧）
- **开源**：MIT
- **与 NextFrame 关联**：低相关性。轻量库适合 Web，不适合视频场景。

### Motion（原 Framer Motion）
- **地址**：https://motion.dev/
- **Stars**：25k+（npm: framer-motion）
- **定位**：React 生态动画库，声明式 API。有 `AnimateNumber` 数字动画组件。
- **动画质量**：流畅
- **输出视频**：❌ 无原生支持
- **开源**：MIT
- **与 NextFrame 关联**：ccBigNumber 场景的数字滚动动画参考来源

---

## 三、数据可视化图表库（图表质量参考）

### D3.js
- **地址**：https://github.com/d3/d3
- **Stars**：113k
- **定位**：底层 SVG/Canvas 数据绑定引擎。不是"图表库"，是"造图表的工具"。
- **动画质量**：流畅（自带 transition + interpolator + easing）
- **输出视频**：❌ 无原生，需外部截帧
- **开源**：ISC
- **与 NextFrame 关联**：
  - NextFrame 的 lineChart / barChartReveal 应参考 D3 的动画过渡思路
  - D3 的"数据驱动更新 → 自动差值动画"就是 NextFrame JSON diff 动画的理想模型
  - 启发：barChartReveal 应支持数据更新动画（旧值→新值 smooth transition）

### Apache ECharts
- **地址**：https://github.com/apache/echarts
- **Stars**：66.1k（v6.0.0，2025 年 7 月发布）
- **定位**：功能最完整的 JS 图表库。20+ 图表类型，Canvas/SVG 双渲染。
- **动画质量**：流畅（内置初始化动画 + 数据更新动画）
- **输出视频**：❌ 无原生（但有 SSR 模式可截帧）
- **开源**：Apache 2.0
- **与 NextFrame 关联**：
  - ECharts 是 NextFrame 图表场景的功能对标标准
  - ECharts 的 bar chart race（动态排序 + 平滑重排）是 NextFrame 未来可以实现的场景

### Chart.js
- **地址**：https://www.chartjs.org/
- **Stars**：67k
- **定位**：最易用的 Canvas 图表库。8 种基础图表，内置动画。
- **动画质量**：基础（进入动画/更新动画，不支持自定义缓动细节）
- **输出视频**：❌ 无
- **开源**：MIT
- **与 NextFrame 关联**：低。Chart.js 的图表视觉风格可作为 NextFrame lineChart/barChartReveal 的设计参考。

### Recharts
- **地址**：https://github.com/recharts/recharts
- **Stars**：26.6k
- **定位**：React + D3 封装的声明式图表库。
- **动画质量**：基础（简单进入动画，无自定义支持）
- **输出视频**：❌ 无
- **开源**：MIT

### Nivo
- **地址**：https://nivo.rocks/
- **Stars**：14k
- **定位**：React 图表库，SVG/Canvas/HTML 三种渲染模式，视觉精致。
- **动画质量**：流畅（react-spring 驱动）
- **输出视频**：❌ 无
- **开源**：MIT
- **与 NextFrame 关联**：Nivo 的视觉风格（暗色主题 + 精致颜色系统）值得 NextFrame 图表场景参考。

### amCharts 5
- **地址**：https://www.amcharts.com/
- **Stars**：N/A（商业库）
- **定位**：商业级图表库。支持 Bar Chart Race，**可直接导出视频**（独家功能）。
- **动画质量**：电影级（平滑排序动画、时间轴动画）
- **输出视频**：✅ 支持！可导出 MP4 视频或嵌入 HTML
- **开源**：商业授权（免费版有限制）
- **与 NextFrame 关联**：
  - amCharts 的 Bar Chart Race 视频导出是 NextFrame 的直接竞品功能
  - NextFrame 的 barChartReveal + 时间轴排序 + 视频输出 = 开源替代方案

---

## 四、数据故事工具（非编程，SaaS）

### Flourish
- **地址**：https://flourish.studio/
- **定位**：数据故事 SaaS。无代码，上传 CSV 即生成动态图表、Bar Chart Race、地图等。
- **动画质量**：流畅（Bar Chart Race 是招牌功能）
- **输出视频**：⚠️ 有限（付费计划可导出 PNG/SVG，视频需录屏或特定方案）
- **开源**：❌ 闭源商业 SaaS
- **与 NextFrame 关联**：
  - 用户场景对标。Flourish 的核心用户（新闻记者、数据分析师）是 NextFrame 的目标用户
  - 关键差异：Flourish 是交互式网页，NextFrame 是视频文件

### Datawrapper
- **地址**：https://www.datawrapper.de/
- **定位**：新闻媒体数据可视化工具，静态图表为主。
- **动画质量**：基础
- **输出视频**：❌ 不支持
- **开源**：❌ 商业 SaaS

---

## 五、程序化动画引擎（视频专用）

### Manim（3Blue1Brown 原版 + 社区版）
- **地址（社区版）**：https://github.com/ManimCommunity/manim | **原版**：https://github.com/3b1b/manim
- **Stars（社区版）**：37.8k
- **定位**：Python 数学动画引擎。用代码精确描述动画，直接渲染 MP4。3Blue1Brown 用它做所有教学视频。
- **动画质量**：电影级（基于 Cairo/OpenGL，矢量精确，支持 LaTeX 公式）
- **输出视频**：✅ 原生 MP4/GIF 输出
- **开源**：MIT（社区版）
- **数据可视化能力**：
  - 内置 BarChart、NumberPlane、Axes、Graph 等
  - 支持 `change_bar_values()` 做数据更新动画
  - 适合"讲解型"数据动画，不适合"商业图表"风格
- **与 NextFrame 关联**：
  - Manim 是 NextFrame 在"解说动画"方向的最强参考
  - 差异：Manim 需要写 Python 代码；NextFrame 只需 JSON
  - 启发：NextFrame 应支持 Manim 风格的"数据演变动画"（bar 高度变化 + 自动排序）

---

## 六、Vizzu（特别关注）

### Vizzu
- **地址**：https://github.com/vizzuhq/vizzu-lib
- **Stars**：约 2k（2025 年 8 月发布 v0.17.1）
- **定位**：专为"图表间无缝动画过渡"设计。C++ 编译为 WebAssembly，零依赖。
- **核心能力**：
  - 同一数据集，在折线图、柱状图、散点图之间平滑动画切换
  - 数据聚合/过滤自动驱动动画
  - 支持 Scrollytelling 扩展（滚动触发图表变化）
  - Python 版（ipyvizzu）可在 Jupyter 使用
- **动画质量**：电影级（专为"数据故事连续动画"设计）
- **输出视频**：⚠️ 无直接视频输出，但 Canvas 渲染可截帧
- **开源**：Apache 2.0
- **与 NextFrame 关联**：
  - **高度相关**。Vizzu 的"图表形态过渡动画"是 NextFrame 最缺的能力
  - NextFrame 目前 barChartReveal / lineChart 是独立场景，不支持图表间过渡
  - 启发：增加 chartMorph 场景，支持柱状图→折线图的平滑变形

---

## 七、Scrollytelling 工具

### BSMNT Scrollytelling
- **地址**：https://github.com/basementstudio/scrollytelling
- **Stars**：约 2k
- **定位**：React + GSAP ScrollTrigger 封装，简化滚动驱动动画。
- **动画质量**：流畅
- **输出视频**：❌ 网页交互，非视频

### Google Scrollytell
- **地址**：https://google.github.io/scrollytell/
- **定位**：极简滚动同步工具库，requestAnimationFrame 驱动。

> **与 NextFrame 关联**：Scrollytelling 本质是"滚动 = 时间轴"。NextFrame 的 keyframe timeline 可以映射为类似的用户心智模型。

---

## 八、3D 数据可视化

### Three.js
- **地址**：https://threejs.org/
- **Stars**：101k
- **定位**：WebGL 3D 引擎，可做 3D 图表（3D bar、3D scatter 等）。
- **动画质量**：电影级（GPU 加速，60fps）
- **输出视频**：⚠️ 需配合 CCapture.js 或 puppeteer 截帧
- **开源**：MIT
- **与 NextFrame 关联**：NextFrame 目前无 3D 图表场景，Three.js 是未来扩展参考。DataReels Animator（基于 Three.js）已实现 3D 数据动画视频导出。

---

## 九、Lottie 生态

### Lottie
- **地址**：https://lottiefiles.com/
- **定位**：JSON 格式矢量动画，After Effects → Lottie JSON → 播放。2025 年获 IANA 官方 MIME type（`video/lottie+json`）。
- **动画质量**：流畅（矢量，帧级精确）
- **输出视频**：✅ 可导出 MP4/GIF（LottieFiles 平台）
- **开源**：播放器开源（lottie-web MIT），动画制作需 AE 或 LottieFiles
- **与 NextFrame 关联**：
  - NextFrame 已有 `lottieAnim` 场景，可直接播放 Lottie 文件
  - Lottie 适合做 icon 级数据可视化动画（仪表盘、进度圈等），不适合大规模数据图表

---

## 十、综合对比矩阵

| 库 | Stars | 图表动画质量 | 视频输出 | 开源 | 与 NextFrame 相关度 |
|---|---|---|---|---|---|
| Remotion | 43.1k | 电影级 | ✅ 原生 | 有限 | ⭐⭐⭐⭐⭐ 直接竞品 |
| Motion Canvas | 18.4k | 电影级 | ✅ 原生 | MIT | ⭐⭐⭐⭐ 架构参考 |
| Manim | 37.8k | 电影级 | ✅ 原生 | MIT | ⭐⭐⭐⭐⭐ 场景参考 |
| D3.js | 113k | 流畅 | ❌ 需截帧 | ISC | ⭐⭐⭐⭐ 动画逻辑参考 |
| ECharts | 66.1k | 流畅 | ❌ 需截帧 | Apache 2.0 | ⭐⭐⭐⭐ 功能对标 |
| Vizzu | 2k | 电影级（形变） | ❌ 需截帧 | Apache 2.0 | ⭐⭐⭐⭐⭐ 能力补充 |
| amCharts 5 | N/A | 电影级 | ✅ 原生 | 商业 | ⭐⭐⭐⭐ 直接竞品功能 |
| GSAP | 19.2k | 电影级 | ⚠️ 需插件 | 有限 | ⭐⭐⭐ 动画引擎参考 |
| Chart.js | 67k | 基础 | ❌ | MIT | ⭐⭐ 视觉参考 |
| Recharts | 26.6k | 基础 | ❌ | MIT | ⭐ |
| Nivo | 14k | 流畅 | ❌ | MIT | ⭐⭐ 视觉参考 |
| Lottie | N/A | 流畅 | ✅（平台） | 播放器开源 | ⭐⭐⭐ 已集成 |
| Flourish | N/A | 流畅 | ⚠️ 有限 | 闭源 | ⭐⭐⭐⭐ 用户场景对标 |
| Anime.js | 67.1k | 流畅 | ❌ | MIT | ⭐ |

---

## 十一、对 NextFrame 的启发

### 立即可用
1. **barChartReveal 加数据更新动画**：参考 D3 transition + ECharts 数据更新，让 bar 高度平滑变化
2. **horizontalBars 加 stagger 参数**：参考 GSAP stagger，bar 逐条入场，不要同时出现
3. **ccBigNumber 缓动优化**：参考 GSAP ease 体系（`power2.out`），数字滚动尾部减速感

### 中期规划
4. **chartMorph 场景**：参考 Vizzu，支持柱状图→折线图形态变换
5. **Bar Chart Race 场景**：参考 amCharts 5 + Manim，数据时间轴动态排序视频
6. **dataPulse 强化**：参考 ECharts 波纹动画，数据点出现时的涟漪效果

### 竞争定位
- **vs Remotion**：NextFrame = JSON 驱动，门槛更低，AI 友好；Remotion = React 写，工程师门槛
- **vs Manim**：NextFrame = 商业数据图表风格；Manim = 数学教学风格
- **vs amCharts**：NextFrame = 开源 + 视频原生输出；amCharts = 商业授权 + 交互式为主
- **vs Flourish**：NextFrame = 本地视频文件；Flourish = 嵌入式网页交互
