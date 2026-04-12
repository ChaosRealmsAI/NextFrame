# 10 · HTML 合成设计

v0.3 的唯一目标：**timeline JSON → 一个可播放的 HTML 文件 → 浏览器打开即看视频。**

## 一、输入与输出

```
输入: timeline.json（多轨道、多 clip、各种 scene + effect + filter + blend）
输出: output.html（自包含、零依赖、浏览器打开就能播放）
命令: nextframe harness timeline.json → output.html
```

## 二、HTML 结构

```html
<body>
  <!-- 舞台：固定视频尺寸 -->
  <div id="stage" style="width:1920px; height:1080px; position:relative; overflow:hidden">

    <!-- Track 0 (最底层) -->
    <div class="track" style="z-index:0; position:absolute; inset:0">
      <!-- Clip: Canvas scene -->
      <div class="clip" style="position:absolute; inset:0; display:none"
           data-start="0" data-dur="10" data-blend="normal">
        <canvas width="1920" height="1080"></canvas>
      </div>
    </div>

    <!-- Track 1 -->
    <div class="track" style="z-index:1; position:absolute; inset:0">
      <!-- Clip: DOM scene -->
      <div class="clip" style="position:absolute; inset:0; display:none"
           data-start="1" data-dur="5" data-blend="normal"
           data-effect-enter="fadeIn:0.6" data-effect-exit="fadeOut:0.4"
           data-filter="none">
        <!-- scene 内容直接是 DOM -->
        <h1 style="...">标题文字</h1>
      </div>
    </div>

    <!-- Track 2 -->
    <div class="track" style="z-index:2; position:absolute; inset:0">
      <!-- Clip: SVG scene -->
      <div class="clip" style="position:absolute; inset:0; display:none"
           data-start="0" data-dur="10" data-blend="screen">
        <svg viewBox="0 0 1920 1080">...</svg>
      </div>
    </div>

  </div>
</body>
```

### 规则

1. **`#stage`** = 视频画布，尺寸等于 `project.width × project.height`
2. **`.track`** = 一条轨道，`position:absolute; inset:0`，z-index 等于轨道序号（0 = 最底层）
3. **`.clip`** = 一段内容，默认 `display:none`，JS 每帧判断是否激活
4. **clip 内容** = scene 渲染结果，可以是 canvas / DOM / SVG / WebGL / video / img

### 音频轨道

`kind: "audio"` 的 track 不生成 DOM 元素，由 Web Audio API 在 JS 层处理。

## 三、Scene 怎么放进 clip

每个 scene 按内容类型选择渲染技术：

### Canvas Scene（动态像素类）

```html
<div class="clip" data-scene="auroraGradient" ...>
  <canvas width="1920" height="1080" style="width:100%;height:100%"></canvas>
</div>
```

JS 每帧调 `sceneRender(localT, params, ctx)` 重绘 canvas。

适用：auroraGradient, particleFlow, circleRipple, fluidBackground, starfield, pixelRain, meshGrid, neonGrid, shapeBurst, orbitRings, spotlightSweep, dataPulse, countdown, filmGrain 效果层

### DOM Scene（文字排版类）

```html
<div class="clip" data-scene="kineticHeadline" ...>
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
    <h1 style="font:900 96px -apple-system,sans-serif;
               background:linear-gradient(...);
               -webkit-background-clip:text;-webkit-text-fill-color:transparent">
      NextFrame
    </h1>
  </div>
</div>
```

JS 每帧更新 DOM 元素的 style（opacity / transform / 文字内容）。

适用：kineticHeadline, textOverlay, lowerThirdVelvet, cornerBadge, ccBigNumber, ccPill, ccNote, ccDesc, ccFrame, glitchText, htmlSlide, markdownSlide, codeBlock, quoteBlock, iconCardGrid, horizontalBars, toolboxSlide

### SVG Scene（矢量图形类）

```html
<div class="clip" data-scene="barChartReveal" ...>
  <svg viewBox="0 0 1920 1080" style="width:100%;height:100%">
    <rect class="bar" x="100" y="200" width="50" height="0" fill="#6ee7ff"/>
    ...
  </svg>
</div>
```

JS 每帧更新 SVG 属性（height / transform / opacity）。

适用：barChartReveal, lineChart, 图标类, 矢量装饰, 路径动画

### WebGL Scene（GPU 着色器类）

```html
<div class="clip" data-scene="shaderBackground" ...>
  <canvas id="webgl-xxx" style="width:100%;height:100%"></canvas>
</div>
```

JS 每帧传 uniform 值（u_time），GPU 计算像素。

适用：复杂流体、3D 场景、粒子系统（未来）

### Media Scene（媒体素材类）

```html
<!-- 图片 -->
<div class="clip" data-scene="imageHero" ...>
  <img src="data:image/png;base64,..." style="width:100%;height:100%;object-fit:cover"/>
</div>

<!-- 视频 -->
<div class="clip" data-scene="videoClip" ...>
  <video src="..." muted style="width:100%;height:100%;object-fit:cover"></video>
</div>
```

JS 每帧控制 video 的 currentTime（frame-pure）。图片不需要每帧更新。

适用：imageHero, videoClip, videoWindow, svgOverlay, lottieAnim

## 四、Effect / Filter / Blend 怎么实现

全部用 CSS，不用 JS 像素操作。

### Effect（进出场动画）

clip 容器上 JS 每帧设置：

```js
// fadeIn: 前 0.6s
clip.style.opacity = easeOutCubic(localT / 0.6);

// slideUp: 前 0.8s
clip.style.opacity = p;
clip.style.transform = `translateY(${(1-p) * 40}px)`;

// scaleIn: 前 0.5s
clip.style.transform = `scale(${0.9 + 0.1 * p})`;

// fadeOut: 最后 0.4s
clip.style.opacity = 1 - p;
```

不用 CSS animation（无法精确控制时间），用 JS 算值 + 直接赋 style。

### Filter（色彩后处理）

clip 容器上设置 CSS filter：

```js
clip.style.filter = 'grayscale(1)';           // 灰度
clip.style.filter = 'sepia(0.8)';             // 复古
clip.style.filter = 'saturate(1.3) hue-rotate(15deg)'; // 暖色调
clip.style.filter = 'saturate(0.8) hue-rotate(-10deg)'; // 冷色调
// filmGrain: 用一个半透明噪点层覆盖（单独的 canvas）
```

GPU 加速，零像素操作。

### Blend（图层混合）

clip 容器上设置 CSS mix-blend-mode：

```js
clip.style.mixBlendMode = 'screen';   // 叠加发光
clip.style.mixBlendMode = 'lighten';  // 取亮
clip.style.mixBlendMode = 'multiply'; // 正片叠底
```

浏览器 GPU 自动合成。

## 五、时间控制

核心函数 `renderFrame(t)`，每帧执行：

```js
function renderFrame(t) {
  for (const clip of allClips) {
    const localT = t - clip.start;
    const active = t >= clip.start && t < clip.start + clip.dur;

    // 1. 显隐控制
    clip.el.style.display = active ? 'block' : 'none';
    if (!active) continue;

    // 2. Keyframe 参数插值
    const params = resolveKeyframes(clip.rawParams, localT);

    // 3. Effect（进出场）
    const { opacity, transform } = calcEffect(clip, localT);
    clip.el.style.opacity = opacity;
    clip.el.style.transform = transform;

    // 4. Filter
    clip.el.style.filter = clip.cssFilter;

    // 5. Blend
    clip.el.style.mixBlendMode = clip.blend;

    // 6. Scene 渲染
    if (clip.type === 'canvas') {
      clip.sceneFn(localT, params, clip.ctx);
    } else if (clip.type === 'dom') {
      clip.sceneUpdate(localT, params, clip.el);
    } else if (clip.type === 'svg') {
      clip.sceneUpdate(localT, params, clip.svgEl);
    } else if (clip.type === 'webgl') {
      clip.sceneUpdate(localT, params);
    } else if (clip.type === 'video') {
      clip.videoEl.currentTime = localT;
    }
  }
}
```

### 浏览器预览

```js
// 自动播放
requestAnimationFrame(function tick() {
  const t = (performance.now() - startTime) / 1000;
  renderFrame(t);
  requestAnimationFrame(tick);
});

// 拖动时间轴
slider.oninput = () => renderFrame(slider.value / 1000);
```

### 录制协议

```js
window.__onFrame = function(frame) {
  renderFrame(Number(frame.time));
  return true;
};
```

同一个 `renderFrame(t)`，预览和录制共用。

## 六、Scene 分类表

| 类型 | 渲染技术 | Scene 列表 |
|------|---------|-----------|
| **Canvas** | Canvas 2D | auroraGradient, fluidBackground, starfield, spotlightSweep, pixelRain, particleFlow, orbitRings, circleRipple, meshGrid, neonGrid, shapeBurst, dataPulse, countdown, pulseWave, radialBurst |
| **DOM** | HTML + CSS | kineticHeadline, textOverlay, lowerThirdVelvet, cornerBadge, glitchText, ccFrame, ccBigNumber, ccPill, ccNote, ccDesc, htmlSlide, markdownSlide, toolboxSlide, codeBlock, quoteBlock, iconCardGrid, horizontalBars |
| **SVG** | SVG | barChartReveal, lineChart, svgOverlay |
| **Media** | img/video | imageHero, videoClip, videoWindow, lottieAnim |
| **WebGL** | WebGL/WebGPU | （v0.3 预留，未有具体 scene） |

Canvas: 15 个 | DOM: 17 个 | SVG: 3 个 | Media: 4 个 = 39 个

## 七、质量保证

### 文字清晰度
DOM 渲染使用系统字体，任何分辨率都清晰。不再用 `ctx.fillText` 手画文字。

### 4K 支持
- DOM 文字：自动清晰
- SVG：矢量无损
- Canvas：设 `width/height` 为 3840×2160
- WebGL：viewport 跟随尺寸

### 比例适配
`#stage` 尺寸由 `project.width × project.height` 决定。支持 16:9 / 4:3 / 9:16 / 1:1。所有 track/clip 用 `inset:0` 填满 stage，scene 内部用百分比布局。

### 视觉一致性
预览和录制看同一个 HTML → 所见即所得。不存在"预览正确但录制错误"的情况。

## 八、不在这个版本做的

- 编辑器交互（拖拽/选中/参数面板）→ v0.4
- 录制优化（CALayer/VideoToolbox）→ 已有，不改
- 音频混合 → 保持现有 ffmpeg mux
- 新 scene 开发 → 先迁移现有 39 个
