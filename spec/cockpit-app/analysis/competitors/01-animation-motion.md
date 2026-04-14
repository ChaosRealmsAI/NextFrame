# 动画与运动效果生态全景调研

> 调研时间：2026-04-14 | 覆盖范围：WebGL/3D、CSS/DOM、Canvas/SVG、React 组件、设计工具、微交互、物理动画
>
> 对 NextFrame 的意义：了解竞品技术选型、交互范式、渲染路径，指导自身动画引擎、时间轴设计和输出格式决策。

---

## 一、WebGL / 3D 动画

| 工具 | GitHub / URL | ⭐ Stars | 开源 / License | 简介 |
|------|-------------|---------|---------------|------|
| **Three.js** | [mrdoob/three.js](https://github.com/mrdoob/three.js) | ~102k | MIT | Web 3D 事实标准，WebGL 抽象层，9 年历史，生态最完整 |
| **React Three Fiber (R3F)** | [pmndrs/react-three-fiber](https://github.com/pmndrs/react-three-fiber) | ~28k | MIT | Three.js 的 React 渲染器，JSX 写 3D 场景；配套 Drei 组件库 |
| **Babylon.js** | [BabylonJS/Babylon.js](https://github.com/BabylonJS/Babylon.js) | ~24k | Apache-2.0 | 微软出品的完整 3D 引擎，内置物理/XR/可视化编辑器 |
| **Spline** | [spline.design](https://spline.design/) | 商业工具 | 免费/付费($15+/月) | 浏览器内 3D 设计工具，可视化建模+动画+一键嵌入；免费版有 Logo |
| **Unicorn Studio** | [unicorn.studio](https://www.unicorn.studio/) | 商业工具 | 付费 SaaS | 无代码 WebGL 特效工具，60+ 着色器效果，36kb 运行时，支持嵌 Framer/Webflow |
| **Vanta.js** | [tengbao/vanta](https://github.com/tengbao/vanta) | ~6.5k | MIT | 基于 Three.js/p5.js 的 3D 背景动画，13 种效果，支持鼠标/陀螺仪交互 |
| **PlayCanvas** | [playcanvas/engine](https://github.com/playcanvas/engine) | ~10k | MIT | 云编辑器 + 实体组件引擎，面向 3D 游戏和产品可视化 |

**对 NextFrame 的启示：**
- Three.js + R3F 是目前 WebGL 动画的"操作系统"，Drei 相当于标准库
- Unicorn Studio 证明了「设计师用 shader 不需要写代码」的产品方向是可行的
- Spline 的一键嵌入 = 把 3D 降维为"素材"，NextFrame 输出格式可参考

---

## 二、CSS / DOM 动画（通用 JS）

| 工具 | GitHub / URL | ⭐ Stars | 开源 / License | 简介 |
|------|-------------|---------|---------------|------|
| **GSAP** | [greensock/GSAP](https://github.com/greensock/GSAP) | ~24.4k | GreenSock 标准授权（免费可商用） | 业界最强 JS 动画平台，时间轴/ScrollTrigger/路径动画，性能极优 |
| **Motion (前 Framer Motion)** | [motiondivision/motion](https://github.com/motiondivision/motion) | ~31.5k | MIT | 现改名 Motion，支持 React/Vue/原生 JS，30M 月下载，弹性物理+手势 |
| **Anime.js** | [juliangarnier/anime](https://github.com/juliangarnier/anime) | ~67.1k | MIT | 轻量 JS 动画引擎，支持 CSS/SVG/DOM/JS 对象，时间轴 API 简洁 |
| **Velocity.js** | [julianshapiro/velocity](https://github.com/julianshapiro/velocity) | ~17k | MIT | jQuery 替代动画库，WhatsApp/Mailchimp 使用，DOM 性能优化 |
| **Popmotion** | [Popmotion/popmotion](https://github.com/Popmotion/popmotion) | ~20.2k | MIT | 函数式动画库，Motion 底层，支持弹性/惯性/物理模拟 |
| **Two.js** | [jonobr1/two.js](https://github.com/jonobr1/two.js) | ~8.6k | MIT | 渲染器无关的 2D 绘图 API，支持 SVG/Canvas/WebGL 三种后端 |

**对 NextFrame 的启示：**
- GSAP 的时间轴 API（`tl.to()`, `tl.from()`）是动画编排的黄金范式，NextFrame 时间轴设计可对标
- Motion 的声明式 API（`<motion.div animate={}>`）大幅降低动画门槛，NextFrame AI 指令层可参考
- Anime.js 的 67k stars 说明「简洁 API + 强大功能」组合的市场需求巨大

---

## 三、Canvas / SVG 动画

| 工具 | GitHub / URL | ⭐ Stars | 开源 / License | 简介 |
|------|-------------|---------|---------------|------|
| **Lottie Web** | [airbnb/lottie-web](https://github.com/airbnb/lottie-web) | ~30k | MIT | Airbnb 出品，AE 导出 JSON 播放，跨平台（iOS/Android/Web） |
| **Rive** | [rive.app](https://rive.app/) / [rive-app/rive-wasm](https://github.com/rive-app/rive-wasm) | ~3k(wasm) | 运行时 MIT，编辑器商业 | 带状态机的交互动画，文件体积比 Lottie 小 10-15x，60FPS 性能极优 |
| **SVG.js** | [svgdotjs/svg.js](https://github.com/svgdotjs/svg.js) | ~11.7k | MIT | 轻量 SVG 操作与动画库 |
| **canvas-confetti** | [catdad/canvas-confetti](https://github.com/catdad/canvas-confetti) | ~12.5k | ISC | 高性能纸屑/烟花动画，专注单一效果做到极致 |
| **tsParticles** | [tsparticles/tsparticles](https://github.com/tsparticles/tsparticles) | ~8k | MIT | particles.js 继任者，粒子/烟花/五彩纸屑，支持所有主流框架 |
| **Granim.js** | [sarcadass/granim.js](https://github.com/sarcadass/granim.js) | ~5.3k | MIT | 流体渐变背景动画，交互式渐变过渡 |

**对 NextFrame 的启示：**
- Rive 状态机 = 「动画 + 逻辑」绑定，是下一代交互动画的标准格式，NextFrame 输出层可支持 Rive 格式
- Lottie 的 AE→JSON 管道已证明设计工具→代码的路径可行，但缺少交互层
- canvas-confetti 的成功说明「单点精品 > 大而全」，NextFrame 特效模块可考虑类似策略

---

## 四、React 专属动画组件库

| 工具 | GitHub / URL | ⭐ Stars | 开源 / License | 简介 |
|------|-------------|---------|---------------|------|
| **React Bits** | [DavidHDev/react-bits](https://github.com/DavidHDev/react-bits) | ~15k | MIT | 110+ 动画组件，2025 JS Rising Stars #2，无需 Framer Motion 依赖 |
| **Aceternity UI** | [ui.aceternity.com](https://ui.aceternity.com/) | 商业 | 免费 | Tailwind + Framer Motion，200+ 生产级组件，复制粘贴即用 |
| **Magic UI** | [magicui.design](https://magicui.design/) | 开源 | MIT | 20+ 组件，适合 SaaS/Startup Landing Page，弹性动画 |
| **React Spring** | [pmndrs/react-spring](https://github.com/pmndrs/react-spring) | ~28k | MIT | 基于弹性物理的 React 动画，声明式 hooks API |
| **React Native Animatable** | [oblador/react-native-animatable](https://github.com/oblador/react-native-animatable) | ~10k | MIT | React Native 标准动画集，声明式过渡 |

**对 NextFrame 的启示：**
- React Bits 的「无框架依赖 + 按需引入 Three.js/GSAP」策略 = NextFrame 组件系统的理想架构
- Aceternity UI 的爆火证明「直接可用的精美动画」比「灵活的底层 API」更受欢迎
- 这类库本质是「动画模式库」，NextFrame 的 AI 场景理解层可以对标

---

## 五、可视化设计工具（Motion Design Tools）

| 工具 | URL | 开源？ | 定价 | 简介 |
|------|-----|--------|------|------|
| **Rive Editor** | [rive.app](https://rive.app/) | 否 | 免费/Pro $15/月 | 浏览器内交互动画设计器，状态机，运行时开源 |
| **Spline** | [spline.design](https://spline.design/) | 否 | 免费/$15/$25/月 | 浏览器内 3D 设计工具，实时协作，一键 Web 嵌入 |
| **Unicorn Studio** | [unicorn.studio](https://www.unicorn.studio/) | 否 | 付费 SaaS | 无代码 WebGL 特效，60+ 效果，Figma/Webflow 插件 |
| **Jitter** | [jitter.video](https://jitter.video/) | 否 | 免费/Pro | "Figma for motion"，浏览器内，适合 UI/社交媒体动效 |
| **LottieFiles** | [lottiefiles.com](https://lottiefiles.com/) | 否 | 免费/Pro | Lottie 动画市场 + 在线编辑器，AE 插件 |
| **Penpot** | [penpot.app](https://penpot.app/) / [penpot/penpot](https://github.com/penpot/penpot) | ✅ | 免费 | 开源 Figma 替代，SVG 原生，支持交互原型（动画能力有限） |

**对 NextFrame 的启示：**
- Rive + Spline + Unicorn Studio 三者构成「3D/交互动画设计工具」的新三角，均瞄准无代码设计师
- Jitter 的定位（"Figma for motion"）和 NextFrame 存在重叠，需差异化：NextFrame 侧重 AI 驱动 + 代码输出
- LottieFiles 市场模式可参考：动画资产 marketplace + SaaS 工具双轮驱动

---

## 六、程序化视频动画（Programmatic Video）

| 工具 | GitHub / URL | ⭐ Stars | 开源 / License | 简介 |
|------|-------------|---------|---------------|------|
| **Remotion** | [remotion-dev/remotion](https://github.com/remotion-dev/remotion) | ~22k | 免费/商业 | React 写视频，用 CSS/Canvas/WebGL 渲染帧，导出 MP4，支持服务端渲染 |
| **Motion Canvas** | [motion-canvas/motion-canvas](https://github.com/motion-canvas/motion-canvas) | ~18.4k | MIT | TypeScript + Generator 写动画，实时预览编辑器，FFmpeg 导出视频 |
| **Theatre.js** | [theatre-js/theatre](https://github.com/theatre-js/theatre) | ~12.4k | Core: Apache-2.0 / Studio: AGPL-3.0 | 时间轴动画编辑器 + 程序化 API，支持 Three.js/React，可视化编排复杂动画 |
| **Manim** | [3b1b/manim](https://github.com/3b1b/manim) | ~72k | MIT | 3Blue1Brown 用的数学动画引擎（Python），精确程序化动画，Manim Community 版更稳定 |

**对 NextFrame 的启示：**
- **这是 NextFrame 最直接的竞品区间**
- Remotion：React 写视频 = 代码即视频，证明了「程序化视频」的工程可行性
- Motion Canvas：Generator 驱动 = 天然支持暂停/恢复/时间轴精确控制，API 设计值得深研
- Theatre.js：在浏览器内实现了"录制+回放"式的动画工作流，AI 可直接操作时间轴参数
- Manim：72k stars 的数学动画库，说明「精确控制每一帧」的需求巨大，NextFrame 应支持导出 Manim 风格动画

---

## 七、滚动 & 微交互动画

| 工具 | GitHub / URL | ⭐ Stars | 开源 / License | 简介 |
|------|-------------|---------|---------------|------|
| **Lenis** | [darkroomengineering/lenis](https://github.com/darkroomengineering/lenis) | ~10k | MIT | 最流行的平滑滚动库，WebGL 滚动同步利器 |
| **Locomotive Scroll** | [locomotivemtl/locomotive-scroll](https://github.com/locomotivemtl/locomotive-scroll) | ~8k | MIT | 基于 Lenis 的滚动检测 + 视差动画封装 |
| **AOS (Animate on Scroll)** | [michalsnik/aos](https://github.com/michalsnik/aos) | ~26k | MIT | 8KB 极轻量滚动入场动画，CSS3 驱动 |
| **ScrollReveal** | [jlmakes/scrollreveal](https://github.com/jlmakes/scrollreveal) | ~22.5k | MIT | JS 控制元素滚动显现，更灵活的 API |
| **Design Spells** | [designspells.com](https://www.designspells.com/) | 否（灵感库） | 免费浏览 | 微交互 + 彩蛋收集平台，5500+ 订阅者，是微交互设计的灵感来源 |
| **Auto Animate** | [formkit/auto-animate](https://github.com/formkit/auto-animate) | ~12k | MIT | 一行代码给任何 DOM 变化添加平滑过渡，零配置 |
| **lax.js** | [alexfoxy/lax.js](https://github.com/alexfoxy/lax.js) | ~10.5k | MIT | 4KB 的滚动特效库，缓动公式驱动 |

**对 NextFrame 的启示：**
- Design Spells 不是工具，是「设计审美灵感库」——NextFrame 的 AI 可以学习这些微交互模式
- Auto Animate 的「零配置」哲学 = NextFrame AI 指令的终极目标：说"给这个添加过渡"就能生效
- Lenis 是现代 WebGL 项目的标配，NextFrame 的 Web 预览层应集成

---

## 八、物理动画

| 工具 | GitHub / URL | ⭐ Stars | 开源 / License | 简介 |
|------|-------------|---------|---------------|------|
| **Matter.js** | [liabru/matter-js](https://github.com/liabru/matter-js) | ~17k | MIT | 2D 刚体物理引擎，碰撞/重力/约束模拟 |
| **Rapier (via @react-three/rapier)** | [dimforge/rapier](https://github.com/dimforge/rapier) | ~5k | Apache-2.0 | Rust 写的高性能物理引擎，R3F 生态首选，WASM 运行 |
| **React Spring** | [pmndrs/react-spring](https://github.com/pmndrs/react-spring) | ~28k | MIT | 弹性物理动画（非刚体），UI 动画最自然的感觉 |
| **Popmotion** | [Popmotion/popmotion](https://github.com/Popmotion/popmotion) | ~20.2k | MIT | 函数式物理动画原语，Motion 的底层 |

**对 NextFrame 的启示：**
- Matter.js 可为 NextFrame 的物理特效层（粒子碰撞、重力场景）提供底层支撑
- 弹性物理（React Spring/Popmotion）是现代 UI 动画的「必备感觉」，NextFrame 的缓动编辑器应内置弹性参数

---

## 九、综合竞争格局分析

### NextFrame 的差异化空间

```
                        设计工具
                    Spline ● Unicorn Studio
                        ●Rive
                        |
  程序化 ───────────────┼──────────────── 可视化
  Manim ● Motion Canvas |        Jitter ●
  Remotion ●            | Theatre.js ●
                        |
                   NextFrame 目标区间
                  (AI驱动 + 程序化 + 可视化)
                        |
                   代码输出层
```

### 关键技术借鉴点

| 维度 | 借鉴来源 | 具体内容 |
|------|---------|---------|
| 时间轴 API | GSAP + Theatre.js | `tl.to()` 链式调用 + 可视化时间轴编辑 |
| 声明式动画 | Motion / React Spring | `animate={{ x: 100 }}` 风格，弹性物理默认 |
| 状态机交互 | Rive | 动画 + 逻辑绑定，响应用户事件 |
| 程序化视频 | Remotion + Motion Canvas | Generator 驱动帧序列，精确时间控制 |
| 无代码 WebGL | Unicorn Studio | 设计师直接操作 shader 参数 |
| 微交互语言 | Design Spells | 收集并编码高质量微交互模式 |
| 输出格式 | Lottie + Rive | JSON/二进制动画格式，跨平台运行时 |
| 平滑滚动 | Lenis | Web 预览层的滚动体验 |

### 市场空缺（NextFrame 机会）

1. **AI 理解动画意图** → 现有工具全部需要人手动调参数，没有"说一句话生成动画"的工具
2. **程序化 + 可视化统一** → Remotion 只能写代码；Jitter 只能点击；中间地带空缺
3. **跨格式输出** → 生成一个动画，同时导出 Lottie/Rive/MP4/CSS，没有工具做到
4. **动画知识库 + AI** → Design Spells 有灵感但不能执行；AI 能执行但不懂审美

---

*数据来源：GitHub、官方文档、Product Hunt、各工具官网（2026-04）*
