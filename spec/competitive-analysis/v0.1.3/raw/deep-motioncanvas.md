# Motion Canvas · Deep Tech

> v0.1.3 深挖 · 18.4k stars · TS generator-based · Aarthificial(Jacob)独立开发 · 最新 v3.17.2(2024-12-14)· 生态 12 package monorepo。本文聚焦**该偷的两件**(generator/signal + live preview)+ 其他 6 维。

---

## 1. Generator/Signal API(★★ 重点)

### 1.1 核心心智模型 · scene = generator function

```tsx
import {Circle, makeScene2D} from '@motion-canvas/2d';
import {all, createRef} from '@motion-canvas/core';

export default makeScene2D(function* (view) {
  const myCircle = createRef<Circle>();
  view.add(
    <Circle ref={myCircle} x={-300} width={140} height={140} fill="#e13238" />,
  );
  yield* all(
    myCircle().position.x(300, 1).to(-300, 1),
    myCircle().fill('#e6a700', 1).to('#e13238', 1),
  );
});
```

**关键语法**:
- `function*` — generator · 不是 async 不是普通 function
- `yield` — 推进 1 帧(最原子的时间单位)
- `yield*` — 委托给子 generator(调另一个 `tween()` / `all()` 等)
- `.to(value, duration)` — 链式续接下一段 tween(避免嵌套)

### 1.2 Flow 控制符(时序组合子)

```tsx
// 顺序 · 默认就是顺序
yield* myCircle().fill('#e6a700', 1);
yield* myCircle().fill('#e13238', 1);

// 并发 · all = 等全部完成
yield* all(
  ...rects.map(rect => rect.position.y(100, 1).to(-100, 2).to(0, 1)),
);

// 等待时间
yield* waitFor(1);

// 单纯推 1 帧(手动帧控制 · 很 low-level)
circle().fill('red');
yield;
circle().fill('blue');
yield;
```

**其他组合子**(API 级 · 官方确认存在):`any`(任一完成)· `chain`(顺序链)· `sequence`(有间隔的串行)· `waitUntil(label)`(等事件标签)· `loop`(循环 · 可 cancel)· `delay(time, task)`(延迟触发)。

### 1.3 Signal 响应式(核心独特 · manim 没有)

```ts
import {createSignal} from '@motion-canvas/core';

// 基础 signal
const signal = createSignal(0);

// 向量 signal
import {Vector2} from '@motion-canvas/core';
const vec = Vector2.createSignal(Vector2.up);

// 3 种调用
const value = signal();      // 读
signal(3);                   // 写
yield* signal(2, 0.3);       // tween 到新值 · duration 0.3s

// 计算属性(自动追踪依赖 · MobX 风格)
const radius = createSignal(1);
const area = createSignal(() => Math.PI * radius() * radius());
radius(2);            // area() 自动变 12.566
yield* radius(4, 2).to(3, 2);  // tween radius · area 自动重算
```

**DEFAULT 哨兵**(恢复初值):
```ts
import {DEFAULT, createSignal} from '@motion-canvas/core';
const signal = createSignal(3);
signal(2);
signal(DEFAULT);              // 立刻恢复 3
yield* signal(DEFAULT, 2);    // 2s tween 回 3
text().lineHeight(DEFAULT);   // 属性 reset
```

### 1.4 tween 底层 · 完整类型签名

```ts
// 最 raw 形态 · 2 参数:duration + 每帧 progress 回调
yield* tween(2, value => {
  circle().fill(
    Color.lerp(
      new Color('#e6a700'),
      new Color('#e13238'),
      easeInOutCubic(value),    // easing 把 0-1 拉曲线
    ),
  );
});

// 向量 arc 插值
yield* tween(2, value => {
  circle().position(
    Vector2.arcLerp(
      new Vector2(-300, 200),
      new Vector2(300, -200),
      easeInOutCubic(value),
    ),
  );
});

// 高层语法糖(推荐)· 属性名.(目标, 时长, easing, interpolator)
yield* circle().color('#e13238', 2);
yield* circle().color('#e13238', 2, easeOutQuad);
yield* circle().position(new Vector2(300, -200), 2, easeInOutCubic, Vector2.arcLerp);

// spring 物理
yield* spring(PlopSpring, -400, 400, 1);

// save/restore 状态栈
circle().save();
yield* circle().position(new Vector2(300, -200), 2);
yield* circle().restore(1, linear);
```

### 1.5 Thread / 并发取消

Thread 类封装 generator · 可检测祖先是否被 cancel(`isCanceled()`)· 原语:
- `cancel(...tasks)` — 终止一批 task
- `join(...tasks)` — 挂起当前 generator 等完成
- `loop(() => task)` + `cancel` — 可打断的循环

### 1.6 Scene primitive 清单

`@motion-canvas/2d/lib/components` 全表:`View2D`(根)· `Node`(基类)· `Rect` · `Circle` · `Txt` · `Layout`(flex 容器)· `Img` · `Video` · `Line` · `Path` · `Polygon` · `Bezier` / `CubicBezier` / `QuadBezier` · `Curve` · `Spline` · `Knot` · `Grid` · `Icon` · `Ray` · `SVG` · `Latex`(数学公式)· `Code`(代码高亮 + 编辑动画)· `Camera`(2D 镜头 · 平移缩放)· `Shape`(基类)。

用法 JSX-like:`<Circle size={100} fill="#e13238" />` / `<Rect width={200} height={100} fill="blue" radius={10} />` / `<Txt text="Hello" fontSize={48} fill="white" fontFamily="Arial" />`。**注意**:JSX 但不是 React · 是 Motion Canvas 自己的 JSX factory。

### 1.7 作者为啥选 generator 不选 async/await(设计决策 · 权威引语)

GitHub discussion #941(2024-02-07)· Aleksey-Danchin 提议改 async/await · **aarthificial 原话**:

> "Generators work better with animation because you can explicitly progress them each frame by calling `next` and cancel them by calling `return`."

> "I'm personally not interested in implementing any async/await-based solutions due to the reasons stated above."

理由:
- `async/await` 要从 Promise 里抠 resolve 回调才能逐帧推 · 复杂
- 用户写自定义 promise 复杂度爆炸
- Scene 本身 generator-independent · `GeneratorScene` 只是一个实现
- 更像要补的是 `spawn` 函数(分叉 task)

---

### NextFrame 启发(对 generator/signal API 抄啥)

TS describe 层(P2 / P3)直接抄这个模型:

```ts
// NextFrame 假想 API(抄 Motion Canvas)
export default defineScene(function* (ctx) {
  const anchor = ctx.anchor('hero-title');   // 锚点

  yield* all(
    anchor.opacity(0, 1).to(1, 0.5),        // 0→1 用 1s · 然后 to 1
    anchor.y(100, 0.8, easeOutCubic),
  );
  yield* waitFor(0.3);
  yield* ctx.track('camera').pan(200, 1);   // track = 轨道
});
```

**4 个关键抄点**:
1. **generator 作为时间轴** — `yield*` 串时序比 `setTimeout` / Promise 链清晰
2. **signal 响应式** — `createSignal` + 自动依赖追踪(MobX 内核即可)· 让 anchor/track 属性可 bind
3. **链式 tween** — `.to(val, dur)` 避免嵌套 · 可读性爆炸
4. **flow 组合子** — `all / any / chain / sequence / waitFor / waitUntil / loop / delay` 一整套 · 别自己发明

**避坑**:不要 async/await(作者权威理由 · generator 对逐帧控制 + cancel 更干净)。

---

## 2. Live Preview 闭环(★★ 重点)

### 2.1 Vite Plugin 架构

`@motion-canvas/vite-plugin` 是 Vite 插件数组 · 入口签名:

```ts
export default ({
  project = './src/project.ts',
  output = './output',
  bufferedAssets = /^$/,
  editor = '@motion-canvas/ui',
  proxy,
  buildForEditor,
}: MotionCanvasPluginConfig = {}): Plugin[]
```

返回多个 Vite Plugin 实例 · 各司其职:
- `scenesPlugin()` — 处理 `?scene` 查询参数(把 `.tsx` 当 scene 编译)
- `corsProxyPlugin()` — HTTP 代理(资源跨域)
- `editorPlugin()` — 挂 `@motion-canvas/ui` 编辑器到 `/`
- `exportPlugin()` — 渲染导出服务端

### 2.2 HMR 热重载机制(借 Vite · 不自己造)

Motion Canvas 直接复用 Vite 原生 HMR:
- 改 `.tsx` scene 文件 → Vite 推模块更新
- `scenesPlugin` transform 时保留 scene 标识 · 编辑器侧热替换 Scene 描述
- `Scene.reload(description?)` — 收到新 description 后刷新当前 scene 状态

**痛点**(HN + issue #1115 曝光):HMR 时 **Time Events 丢失**(event 位置 reset 到 0)· 跟音轨对齐时工作量毁掉 · 属于 UX 级 bug 没解决。

### 2.3 Scene 生命周期 & 时间 scrub 策略

`Scene<T>` 接口(`packages/core/src/scenes/Scene.ts`)核心方法:

```ts
interface Scene<T = unknown> {
  // 渲染 / 推进
  render(context: CanvasRenderingContext2D): Promise<void>;
  next(): Promise<void>;                       // 推 1 帧
  reload(description?: SceneDescriptionReload<T>): void;
  recalculate(setFrame: (frame: number) => void): Promise<void>;

  // 状态生命周期
  reset(previous?: Scene): Promise<void>;     // ⚠️ 回到起点
  enterInitial(): void;
  enterAfterTransitionIn(): void;
  enterCanTransitionOut(): void;

  // 状态查询
  isAfterTransitionIn(): boolean;
  canTransitionOut(): boolean;
  isFinished(): boolean;
  isCached(): boolean;

  // 尺寸
  getSize(): Vector2;
  getRealSize(): Vector2;
}
```

**scrub 实现**(从接口 + 社区帖推断):
- **无随机访问 seek** · 接口没 `seek(frame)` API
- 拖时间轴 → 调 `reset()` 回初态 → 循环调 `next()` 推到目标帧
- `firstFrame` / `lastFrame` 标记 scene 覆盖范围 · 跨 scene 切换用这个定位
- `isCached()` 存在 → 可能有帧缓存 · 但**无快照式随机跳帧**
- **性能痛点**(HN 确认):"播放 Motion Canvas 动画跟玩独立游戏一样耗能" · 因为每次 scrub = 从头 replay + 每帧 Canvas 2D 重绘

### 2.4 编辑器 UI 架构

`@motion-canvas/ui` package:
- **UI 框架**:**Preact**(不是 React · 轻量 · 3KB runtime)
- **JSX factory**:extends 编辑器时要 `import {h} from 'preact'` 而不是 motion-canvas/2d
- **布局模块**:`Viewport`(预览区)· `Timeline`(时间轴 + 事件标记)· `Console`(调试)· `Inspector`(属性)· `SceneGraph`(节点树)
- **扩展**:`makeEditorPlugin` 暴露 hooks + 左侧 sidebar tabs
- **组件库**:暴露 `Tab` / `Pane` 给第三方插件保持一致视觉

### 2.5 编译速度 / 预览延迟

- Vite dev-server · pre-bundle 缓存 · 304 响应优化(官方)
- HMR 粒度 = 单 scene · 不整站刷
- **无测量数字** 公开 · 但 HN 评论"player 吃 CPU 厉害"

---

### NextFrame 启发(对 live preview 抄啥)

1. **抄 Vite plugin 模式** — NextFrame 桌面壳 WebView 加载 HTML · 用 Vite 做 TS/JSON 打包 + HMR · 不自造 watcher
2. **抄 Scene 接口**(`reset / next / recalculate / isFinished`)· 简单够用
3. **避雷**:scrub = reset + replay 的性能坑 · NextFrame 应该**加帧缓存**(关键帧 JSON state snapshot · 跳帧 = 读 snapshot + 少量 replay)
4. **避雷**:Canvas 2D 渲染(吃 CPU)· NextFrame 走 **WebView + DOM/CSS**(硬件加速)或 **原生编码器**(离线)

---

## 3. Scene Graph 渲染

### 3.1 数据结构

- **Node** 基类 · 树形结构(父子 + transform 继承)
- JSX 语法糖 · 不是 React · 是 MC 自己的 factory
- `Layout` 节点做 flexbox · `Camera` 做平移缩放

### 3.2 渲染目标

- **唯一渲染后端**:HTML5 Canvas 2D(`CanvasRenderingContext2D`)
- 每帧清屏 + DFS 遍历 Node 树 + transform 矩阵堆栈 + 绘调用
- **无 WebGL / WebGPU** · 所以复杂场景帧率低

### 3.3 draw call 优化

- **无明显 batch** · Canvas 2D 本身不支持 instance draw
- 性能靠"少量对象"硬扛
- 适合 **MV 风格信息图 / 数学可视化** · 不适合 1000+ 对象粒子

---

## 4. FFmpeg Exporter(MP4 导出)

### 4.1 架构(client/server 拆分)

`packages/ffmpeg/` 有 `client/` + `server/` 两端:
- **client** — 跑在浏览器 · 每帧 canvas → ArrayBuffer · HTTP POST 到 server
- **server** — Node 起的 Express 端 · 接帧 · 喂给 ffmpeg 进程

### 4.2 FFmpeg 调用(用 fluent-ffmpeg 封装)

核心配置:

```ts
// 输入端:raw rgba 流
this.command.input(this.stream)
  .inputFormat('rawvideo')
  .inputOptions(['-pix_fmt rgba', '-s:v', `${size.x}x${size.y}`])
  .inputFps(settings.fps);

// 输出端:yuv420p + 可选 faststart
this.command
  .outputOptions([
    '-pix_fmt yuv420p',
    `-t ${settings.duration / settings.fps}`,
    // 条件性加 '-movflags +faststart'
  ]);
```

**帧传输**:自定义 `ImageStream` 类 · `handleFrame(req: Readable)` → `stream.pushImage(req)` → ffmpeg stdin。

**公开方法**(FFmpegExporterServer):
- `start()` — 初始化 output 目录 · 配 stderr 日志 · 启 ffmpeg command
- `handleFrame(req)` — 喂 1 帧
- `end(result)` — 失败 kill · 成功 await finish

**音频**:复杂 filter chain 做 trim / resample / gain / playback rate / delay。

### 4.3 已知问题

issue "ffmpeg: Export does not contain all frames and frame inconsistencies" — 帧丢失 / 时间戳乱。Open 状态。

---

## 5. API 设计美学

### 5.1 为啥 generator > React frame-number(作者观点)

**Remotion 模式**(React `<Sequence from={30} durationInFrames={60}>`):
- 整个动画是**纯函数**:`frame → pixels`
- 好处:任意跳帧 O(1) · 可 SSR
- 坏处:描述连续动作要手算 frame 号 · 跨 sequence 协调反人类

**Motion Canvas 模式**(generator):
- 动画是**过程**:`yield*` 串时序即代码顺序
- 好处:读代码像读剧本 · 不算 frame 号 · cancel/branch 自然
- 坏处:seek = replay · 性能差

**核心 tradeoff**:Motion Canvas 选**表达力 > 性能** · 目标受众是**做 voice-over 信息图**(一次性渲染)· 不是实时回放。

### 5.2 type safety(TS 一级公民)

- `createSignal<T>` — 值类型自动推断
- `.to(value, duration)` — value 类型跟属性绑死
- IDE 自动补全 + 跳转定义
- JSX 属性 type check — `<Circle fill="red" />` 的 fill 是 `SignalValue<Color>` 类型

### 5.3 链式 + 语法糖

`circle().position.x(300, 1).to(-300, 1)` — 读:先移到 x=300 花 1s · 再回到 -300 花 1s。**时序 + 目标 + 时长** 一句话。

---

## 6. Monorepo 结构

| package | 职责 |
|---|---|
| **core** | 动画引擎 · Scene 接口 · Signal · Thread · flow 组合子 · Project 编排 |
| **2d** | 默认 2D 渲染器 · Node/Rect/Circle/Txt/Code/Latex 等组件 · Canvas 2D 绑定 |
| **ui** | 编辑器界面(Preact)· Timeline / Viewport / Console / Inspector / SceneGraph · 扩展 hook |
| **vite-plugin** | Vite 集成 · `?scene` transform · scenesPlugin + editorPlugin + exportPlugin |
| **ffmpeg** | MP4 导出 · client(浏览器抓帧)+ server(ffmpeg 进程)· fluent-ffmpeg 封装 |
| **player** | `<motion-canvas>` custom element · 网页嵌入播放(独立于编辑器) |
| **create** | `npm init @motion-canvas` 脚手架 |
| **template** | 开发者便利模板 |
| **examples** | 文档站示例动画 |
| **docs** | 文档站(Docusaurus) |
| **e2e** | 端到端测试 |
| **internal** | 内部工具链(lint / build helper) |

构建:**Lerna** 管版本 · **Vite** 管构建 · npm workspaces。

---

## 7. Aarthificial Dogfood 案例(作者自己用)

**Jacob / aarthificial** — 独立游戏开发者 · 做 2D 平台动作游戏 **Astortion** · YouTube 频道以技术 devlog 为主。

Motion Canvas 就是他**为做自己 YouTube 视频发明的工具**(经典 dogfood)。

**3 个实际视频例子**:

1. **"Animating with Code - Motion Canvas"** (2022-06) — 公开 Motion Canvas · 演示库本身 · 视频里全 MC 动画
2. **"Motion Canvas in More Depth"** (2022-06) — 深入讲 generator 模型 · 用 MC 画解说图
3. **"Motion Canvas Development Update"** (2022-10) — 功能进展 · 仍用 MC 画自己演示
4. **"Motion Canvas & Chill"** (2024-04) — 最近 · 放松讲 MC 使用
5. **Astortion Devlog 系列**(#25 "Keeping Track of Every Speaker" / #27 "Schrödinger's Levels" / #28 "Walking on Walls" 等)— 游戏技术讲解 · 架构图 + 数据流 + 算法可视化 **全用 Motion Canvas 画**

**视频源码**:部分在 `motion-canvas/examples` repo · 如 `signalsCode.tsx` · 演示 circle 面积公式随 radius 变化。

**画面风格**:扁平色块 + monospace 文字 + 2D 箭头连线 + 代码高亮块(`Code` 组件是 MC 招牌 · 能 diff 动画展示代码演变)。

---

## 8. 已知痛点(社区曝光)

### 8.1 维护状态疑虑(2025-2026)

- HN 线(item=47191103)有人说"Motion Canvas is also abandoned, the main site is down"
- GitHub issue "Is the repo dead?" open 状态
- **最新 release v3.17.2 · 2024-12-14** · 已 4+ 月无新版(截至 2026-04)
- 作者精力回到 Astortion 游戏开发(devlog 持续更新)
- Discord 2800+ 人 · 社区备份了站点

### 8.2 技术痛点(open issues)

- **Time Events 跨重载丢失**(#1115)— 音轨对齐工作毁坏
- **ffmpeg 导出漏帧 / 时间戳错乱** — MP4 导出不可靠
- **Audio URL 传不了** — 资源管理死板
- **HTMLMediaElement currentTime 非 finite float** — video 组件 bug
- **UI 卡住无响应** — 编辑器稳定性
- **Headless render 缺失** — "Help needed: Headless rendering without browser for automated pipeline"
- **Custom Component setter 文档缺** — signal tween 接入指南空白
- **player 性能差** — HN 公开吐槽"跟跑独立游戏一样耗 CPU"

### 8.3 范围局限(设计选择)

- **只 Canvas 2D** — 没 WebGL/WebGPU · 复杂场景帧率低
- **窄定位**:vector 信息图 + voiceover MV · 不适合通用视频生产
- **程序员门槛**:必须写 TS · 无可视化拖拽(作者明确拒绝)
- **不集成 AI** — 作者**从未公开表态**关于 AI 集成 · 没有 issue/discussion 讨论 AI 接入 · 社区也没强烈呼声 · **推断**:Jacob 是独立工匠 · 专注工具本身 · 让用户写 TS(程序员圈层)· AI 不在路线图

### 8.4 许可证变更(背景)

Discussion #1015 — 改用 **GPL** · 商业用户需注意。

---

## 总结 · 对 NextFrame 的 5 条具体启发

### 1. **抄** · generator + signal 作为 TS describe 层核心

NextFrame P2(JSON→HTML)可以提供**双层 API**:
- **JSON 层**(给 AI / 低层):规整结构化描述
- **TS 层**(给开发者 / 高层):照抄 Motion Canvas `function*` + `yield*` + `createSignal`

TS 层编译成 JSON · JSON 编译成 HTML · 3 段式。MC 证明了 generator 模型对人类写动画**无可替代的清晰度**。作者权威反对 async/await(discussion #941)· 我们别踩坑。

### 2. **抄** · Vite plugin + 帧快照 scrub 策略

桌面壳(v0.5+)live preview 抄:
- **Vite plugin 架构**(scenesPlugin + editorPlugin + exportPlugin 3 分)
- **修改 scrub 策略**:MC 的 "reset + replay" 性能差 · 我们加**关键帧 state snapshot**(每 N 帧存 signal 值 dump)· scrub 时二分找最近 snapshot · 再少量 replay。**这是 MC 留的洞 · 我们补**。

### 3. **观察** · 作者拒 AI 的立场 → NextFrame 走 P9 外接

Motion Canvas 作者(独立工匠视角)从没公开 AI 整合 · 用户是**会写 TS 的程序员**。
**NextFrame 定位完全不同**:AI 是第一用户 · PM 是最终用户。所以:
- **不要在 TS describe 层塞 AI**(与 MC 同层 · 保持工具干净)
- **P9 级外接**:AI agent 生成 JSON → NextFrame 编译 → PM 看桌面壳预览 · AI 只负责"生成描述" 不侵入引擎

### 4. **避** · Canvas 2D 渲染层

MC 的 "唯一 Canvas 2D" 是它最大技术债(HN 实锤 · CPU 狂吃 · 大场景跪)。
NextFrame 选型:
- **预览层**:WebView + DOM/CSS(硬件加速 · 真·浏览器级性能)
- **离线编码层**:原生编码器(macOS VideoToolbox / Windows MF)直接拿帧 · 不走 fluent-ffmpeg+Node(MC 的漏帧 bug 就因为这个桥)
- **复杂视觉**:可选 WebGL / Canvas 2D 混合 · 但不绑死

### 5. **避** · 程序员窄圈定位 + 桌面壳 PM 友好

MC 痛点:编辑器给程序员用 · Timeline events 丢失 / UI 卡顿 / 必须敲 TS。2800 人 Discord 已是天花板。
NextFrame:
- **AI 生成描述 · PM 不写代码** — 根本不和 MC 抢程序员圈
- **桌面壳而不是浏览器** — 原生 UX / 本地资源 / 无跨域问题
- **preview + export 产品化**(不是开源工具)· 商业路径清晰

---

## 关键代码 / URL 索引

### 文档
- Quickstart:https://motioncanvas.io/docs/quickstart/
- Signals:https://motioncanvas.io/docs/signals/
- Tweening:https://motioncanvas.io/docs/tweening/
- Flow:https://motioncanvas.io/docs/flow/
- Video export:https://motioncanvas.io/docs/rendering/video/

### GitHub(source)
- 主 repo:https://github.com/motion-canvas/motion-canvas
- Vite plugin main:`packages/vite-plugin/src/main.ts`
- Scene 接口:`packages/core/src/scenes/Scene.ts`
- FFmpeg server:`packages/ffmpeg/server/FFmpegExporterServer.ts`
- 示例 scene:https://github.com/motion-canvas/examples/blob/master/examples/motion-canvas/src/scenes/signalsCode.tsx
- 2D 组件 API 索引:https://motioncanvas.io/api/2d/components/

### 设计决策 / 作者立场
- 为啥 generator(async/await 讨论):https://github.com/orgs/motion-canvas/discussions/941
- GPL 切换:https://github.com/orgs/motion-canvas/discussions/1015
- Thread/cancel API:https://motioncanvas.io/api/core/threading/

### 痛点 / 社区
- HN 首发:https://news.ycombinator.com/item?id=34897707
- 时间轴丢事件 bug:https://github.com/motion-canvas/motion-canvas/issues/1115
- Remotion 对比(竞品视角):https://www.remotion.dev/docs/compare/motion-canvas

### Dogfood
- Aarthificial YouTube:https://www.youtube.com/@aarthificial
- Animating with Code(MC 发布视频):https://www.youtube.com/watch?v=WTUafAwrunE
- Motion Canvas in More Depth:https://www.youtube.com/watch?v=5j_TENM6I0E
- Patreon:https://www.patreon.com/aarthificial

---

**深挖结论一句话**:Motion Canvas = **"程序员写 TS + generator · 做 voice-over 信息图"** 的单点最强工具 · 其 generator/signal 心智模型值得 NextFrame TS describe 层整套抄 · 但 Canvas 2D 渲染 / 没 AI 集成 / 窄 程序员受众 是硬天花板 · NextFrame 靠 WebView + 原生编码 + AI 外接 + 桌面壳 PM 友好 绕过。
