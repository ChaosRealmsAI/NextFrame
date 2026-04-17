# Compare Success ✓ — 10 风格图谱

**同一个命题**（Success 完成勾），**10 种品牌 DNA**，同底座（frame-pure + scrubber），不同视觉与动效哲学。

## 📊 10 风格 DNA 卡对比

| # | 文件 | 品牌/流派 | 核心关键词 | 配色 | 动效时长 | Spring k/d | 粒子 | 字体 | 记忆锚点 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **linear.html** | Linear | 功能至上 · 瞬间 · 冷静 | 白 + Linear Green `#26b765` | **200ms** | k=400/d=30（高阻尼，无弹） | 0 | Inter | "Boring once done" |
| 2 | **claude.html** | Anthropic Claude | 温暖 · 文学 · 慢 · 克制 | Cream `#faf9f5` + Anthropic Orange `#d97757` | **500-800ms** | k=150/d=20（近临界，零弹） | 3 颗 dust motes | Tiempos 衬线 | 斜体 *"Complete."* 句号 |
| 3 | **apple/like.html**（基准） | Apple | Keynote 级克制优雅 | 白 + Apple Red `#ff3b30` radial gradient | 500ms | k=260/d=14 | 粒子 + 爱心涌起 | SF Pro | Volumetric 2.5D 心 |
| 4 | **arc.html** | Arc Browser | Q 弹 · 拟态 · 玩具感 | Cream + 紫粉蓝流体渐变 | 600-1200ms | k=220/d=14（橡皮弹） | 5 confetti 小球 | Manrope 圆润 | 橡皮呼吸勾画 + 拟态厚度 |
| 5 | **nintendo.html** | Nintendo Switch | 游戏化 · 活泼 · 马里奥感 | 白 + 马里奥红/路易吉绿/皮卡丘黄/任天堂蓝 | 500-1000ms | k=220/d=9（大 overshoot） | 7 颗彩色星星 | Varela Round | PING! + "+1 COIN" |
| 6 | **tiktok.html** | TikTok | 爆发 · 高饱和 · Z 世代 | 黑 + Pink `#fe2c55` + Cyan `#25f4ee` | 200-500ms | k=300/d=12（快弹） | 160 peak（双色） | SF Pro Black Italic | RGB split + emoji + SLAY |
| 7 | **awwwards.html** | Awwwards SOTD | 电影叙事 · 仪式感 · 剧场 | 深紫 + 金 + 暖色 | 2000-3000ms | k=180/d=10/m=1.2（慢落） | 140 gold embers | Serif italic + Bold | "UNLOCKED" 220px + flash |
| 8 | **offwhite.html** | Off-White（Virgil） | Typography as subject | 画廊白 + 黑 + 工业橙 `#ff7300` | 400-700ms | k=240/d=16 | 0 | Helvetica Cond Bold | `"COMPLETE"` 占屏 55% |
| 9 | **risograph.html** | Risograph / 手作 | 双色错位 · 墨点 · zine | Cream 纸本 + Riso Pink + Teal（3px misreg） | 500-1000ms | k=180/d=15 | 8 ink splatter | Uncut Sans + Caveat cursive | 错位套印 + 橡皮印章 |
| 10 | **cyberpunk.html** | 80s Cyberpunk | 霓虹 · Glitch · VHS | 深紫黑 + Cyan + Magenta + Yellow | 300-800ms | k=280/d=14 | — | Monospace 科技 | Tron grid + RGB split glitch 5 次 |
| 11 | **cinematic3d.html** | Cinematic 3D Metal | 电影级 · 钛金属 · 重物感 | 深空 + 钛银 + 暖金高光 | 2000-3500ms | k=140/d=12/m=1.5（重） | 280 stars | — | Sheen sweep 峰值 t=3.3s |

---

## 🔬 观察到的规律

### 时长区间定义品牌气质
```
Linear 200ms        ──→ 克制到近乎"没有动效"
TikTok 300ms        ──→ 快速爆发
Apple 500ms         ──→ 精准反馈
Off-White 500-700ms ──→ Typography 展开
Nintendo 500-1000ms ──→ 弹性游戏感
Arc 600-1200ms      ──→ Q 弹玩具感
Claude 500-800ms    ──→ 慢节奏温暖
Risograph 500-1000  ──→ 手作呼吸
Cyberpunk 300-800ms ──→ 机械 + glitch
Awwwards 2000-3000  ──→ 电影叙事
Cinematic3D 2000-3500 ──→ 重物钛金属
```

### Spring 参数刻画情感温度
- **高阻尼（d>20）** = 冷静 / 精确 / 克制（Linear / Claude）
- **中阻尼（d=14-16）** = 舒适 / 自然（Apple / Arc / Off-White）
- **低阻尼（d=9-12）** = 活泼 / 有弹性 / 玩具感（Nintendo / Arc / TikTok）
- **重物（m>1.2）** = 电影级 / 有质量（Awwwards / Cinematic3D）

### 粒子数量定义品牌年代
- **0 粒子** = 禁欲主义 / 专业 (Linear, Off-White, Cyberpunk core)
- **3-8 粒子** = 克制装饰 (Claude, Apple, Nintendo)
- **100+ 粒子** = 仪式 / 爆发 (Awwwards 140, TikTok 160, Cinematic3D 280 stars)

### 字体即品牌
```
Linear    → Inter              （冷静 sans）
Apple     → SF Pro             （标准 Apple）
Arc       → Manrope            （圆润友好）
Claude    → Tiempos 衬线        （文学感）
Off-White → Helvetica Cond Bold（工业排版）
Risograph → Uncut Sans + Caveat（zine + 手写）
Cyberpunk → Monospace           （科技终端）
```

---

## 🎯 三大核心场景 × 10 风格适配矩阵

### 评分标准（★★★★★ = 完美契合 / ★ = 不推荐）

| 风格 | 🖥 **前端 UI 界面**（SaaS / 产品 / 工具） | 📱 **短视频**（TikTok / 小红书 / Reels） | 📊 **PPT / 数据故事**（汇报 / 发布 / 培训） |
|---|---|---|---|
| **Linear** | ★★★★★ 极致合适（Vercel / Stripe 同源） | ★ 太冷静，3 秒被划走 | ★★★ 专业严肃风场合合适 |
| **Apple** | ★★★★★ 通用基准，最安全 | ★★★ 通用感好但可能偏克制 | ★★★★ 产品发布 / 企业汇报王者 |
| **Arc** | ★★★★★ 创新型 SaaS / 工具 app 绝配 | ★★★★ 可爱年轻向产品 · 视觉记忆点强 | ★★★ 轻松课程 / 团队内部分享 |
| **Claude** | ★★★★ AI / 写作 / 阅读类产品 | ★★ 节奏太慢，短视频不友好 | ★★★★★ 学术 / 深度阅读 / 文学向 |
| **TikTok** | ★ 过于浮夸，企业产品不敢用 | ★★★★★ 原生契合，爆款必备 | ★★ PPT 用会显得廉价 |
| **Nintendo** | ★★★ 游戏化 / 儿童产品 / 教育 | ★★★★ 短视频"成就解锁"类 hook 很强 | ★★★★ 课程完成 / 游戏化培训 |
| **Off-White** | ★★★ 时尚 / 品牌站 | ★★★★ 短视频开场 / 产品亮相 | ★★★★★ **品牌年报 / 设计分享必杀** |
| **Risograph** | ★★★ 独立工作室 / 博客 / 艺术 | ★★★ 小红书手作风 / 文艺向 | ★★★★ 独立创作者作品集 |
| **Awwwards** | ★★ 日常 UI 太重，成就页 OK | ★★★★★ 短视频开场 hero 炸裂 | ★★★★★ **产品发布 / 年终总结剧场** |
| **Cyberpunk** | ★★ 科技产品首屏 / Web3 | ★★★★ 科技向 / 游戏向短视频 | ★★★ 赛博 / 科技主题汇报 |
| **Cinematic3D** | ★ UI 太重无必要 | ★★★★ 产品 reveal 瞬间 | ★★★★★ **发布会 hero / 新品亮相** |

### 一句话匹配指南

**🖥 前端 UI 界面**（用户每天要用 100 次的）
- 首选：**Linear / Apple / Arc** — 克制不打扰
- 避开：Awwwards / Cinematic3D / TikTok（仪式感太重，日用会累）
- 细分：AI 产品 → Claude · 游戏化 → Nintendo · 创新工具 → Arc

**📱 短视频**（3 秒吸引 + 10 秒讲完）
- 首选：**TikTok / Awwwards / Nintendo** — 钩子强 · 密度高 · 有记忆点
- 避开：Linear / Claude（节奏慢，被划走）
- 细分：开场 hero → Awwwards/Cinematic3D · 互动反馈 → TikTok · 成就 → Nintendo

**📊 PPT / 数据故事**（有上下文，观众主动看）
- 首选：**Off-White / Apple / Awwwards / Cinematic3D** — 有仪式感不轻佻
- 避开：TikTok（会显得廉价）
- 细分：汇报 → Apple/Linear · 品牌年报 → Off-White · 发布会 → Awwwards/Cinematic3D · 学术 → Claude

---

## 🔀 不同场景的"组合策略"

### 前端 UI 界面 · 混搭推荐
- **主交互** Linear / Apple 克制基准
- **成就 / 升级** 瞬间切 Nintendo / Arc（打破日常）
- **高光庆祝** 偶尔用 Awwwards（年度解锁 · 里程碑）
- **错误** Linear 红色 shake（不过度惊动）

### 短视频 · 节奏混搭
- **开场 3 秒** Cinematic3D / Awwwards hero（炸场）
- **中段讲解** Apple / Arc（观众不累）
- **数字反馈** TikTok（爆炸感抓眼球）
- **收尾** Off-White typography + 品牌章

### PPT · 结构混搭
- **封面** Cinematic3D / Awwwards（仪式）
- **章节页** Off-White typography
- **内容页** Apple / Linear（克制，让数据说话）
- **成就 / 总结** Nintendo / Arc（情感高点）

---

## 🎨 选择流程图

```
你的作品场景是？
├── 每天要用的 UI → Linear / Apple / Arc
│   ├── AI / 对话 → Claude
│   ├── 创新工具 → Arc
│   ├── 游戏化 → Nintendo
│   └── 标准 SaaS → Linear
│
├── 短视频内容 → TikTok / Nintendo / Awwwards
│   ├── 3 秒 hook → Awwwards / Cinematic3D
│   ├── 互动反馈 → TikTok
│   ├── 成就展示 → Nintendo
│   └── 品牌亮相 → Off-White
│
└── PPT / 汇报 / 发布 → Apple / Off-White / Awwwards
    ├── 企业汇报 → Apple / Linear
    ├── 发布会 → Awwwards / Cinematic3D
    ├── 品牌设计 → Off-White / Risograph
    ├── 学术 / 深度 → Claude
    └── 课程 / 培训 → Nintendo / Arc
```

### 选择维度（当你不知道选哪个）
1. **用户看多久**？5 秒以下 → TikTok/Awwwards；5-15 秒 → Apple/Arc；> 15 秒 → Linear/Claude
2. **情感温度**？冷静 Linear · 温暖 Claude · 兴奋 TikTok · 敬畏 Cinematic3D
3. **场合**？日常 UI → 克制；高光时刻 → 仪式感；内容创作 → 匹配品牌
4. **品牌**：已有品牌调性是什么？品牌用户期待哪种反馈？

---

## 🛠 工程规范（所有 10 个作品都遵守）

**底座共享**（从 `../apple/Design.md` 继承）：
- Frame-pure: `setTime(t)` 单时间源，无 CSS `@keyframes`/`animation`
- 底部 scrubber + play/pause + frame counter + cue marks
- prefers-reduced-motion 处理
- 10s 循环（方便对比）

**风格独立定义**：
- 调色板 · 字体 · 阴影 · 粒子 · Spring 参数
- 动效时长与节奏
- 叙事结构

---

## 📚 延伸阅读

- 动画原子图鉴（Disney 12 原则 + UI）：`../primitives.html`
- Apple-Like 基准（radial gradient + spring）：`../apple/like.html`
- Apple Bookmark：`../apple/bookmark.html`
- Apple Motion Design 宪法：`../apple/Design.md`

## 🔑 核心认识

> **风格 = 原子（12 个 Disney primitive）组装 + 主题（色/字/光/节奏）变换**

所有 10 种风格都是同样的 squash/stretch + anticipation + spring + stagger + timing 这些原子，只是**参数化方式不同**：
- Linear 把 spring 调到阻尼拉满 → 看不到弹
- Arc 把 spring 调到有 overshoot → 玩具感
- Awwwards 把时长拉到 3s → 剧场感
- TikTok 把粒子数 × 100 → 爆发

**原子是字母表，风格是用字母拼成的句子。**
