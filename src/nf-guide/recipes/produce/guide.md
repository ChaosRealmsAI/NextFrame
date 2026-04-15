# Produce Pipeline — 视频生产状态机

从素材到最终 MP4 的完整流程。每步有提示词，跑 `nf-guide produce <step>` 获取。

## 流程图

```
  ┌──────────┐
  │  ratio   │  定比例 → 9:16 / 16:9
  └────┬─────┘
       ▼
  ┌──────────┐
  │  check   │  确认素材 + 检查组件
  └────┬─────┘
       │
       ├── 组件齐全 ──────────────────┐
       │                              │
       ▼                              │
  ┌──────────┐                        │
  │  scene   │  做缺失组件 (循环)      │
  │          │  写 → preview → 改     │
  └────┬─────┘                        │
       │ 全部通过                      │
       ▼◄─────────────────────────────┘
  ┌──────────┐
  │ timeline │  写 Timeline JSON
  └────┬─────┘
       ▼
  ┌──────────┐
  │ validate │  参数门禁
  └────┬─────┘
       │
       ├── error ──→ 改 JSON ──→ 回 validate
       │
       ▼ 0 errors
  ┌──────────┐
  │  build   │  Build HTML + 自动截图
  └────┬─────┘
       │
       ├── 截图有问题 ──→ 改 timeline/scene ──→ 回 validate
       │
       ▼ 截图 OK
  ┌──────────┐
  │  record  │  录制 MP4
  └────┬─────┘
       │
       ├── 单段视频 ──→ 完成
       │
       ▼ 多段
  ┌──────────┐
  │  concat  │  拼接完整一期
  └──────────┘
```

## 步骤一览

| Step | 命令 | 做什么 | 门禁 |
|------|------|--------|------|
| ratio | `nf-guide produce ratio` | 定 9:16 或 16:9 | ratio 确定 |
| check | `nf-guide produce check` | 素材 + 组件齐全？ | 全有 or 缺啥 |
| scene | `nf-guide produce scene` | 做组件 + preview 验证 | 全部 preview OK |
| timeline | `nf-guide produce timeline` | 写 JSON，字幕直接贴 | JSON 写好 |
| validate | `nf-guide produce validate` | nextframe validate | 0 errors |
| build | `nf-guide produce build` | nextframe build + 看截图 | 3 张截图 OK |
| record | `nf-guide produce record` | recorder + ffprobe | MP4 验证通过 |
| concat | `nf-guide produce concat` | ffmpeg 拼接（可选） | 时长匹配 |

## 查看所有已知坑

```bash
nf-guide produce pitfalls
```

## 两种视频类型

### Type A: 有素材（访谈切片）
- 输入: clip.mp4 + fine.json
- 比例: 通常 9:16
- 字幕: params.segments = fine.json.segments（直接贴，不转换）
- 音频: clip.mp4 原声

### Type B: 纯创作（讲解视频）
- 输入: 脚本 + 代码/数据
- 比例: 通常 16:9
- 字幕: params.srt = [{s, e, t}]
- 音频: TTS 合成

## 设计系统

所有视觉参数从 `src/nf-core/scenes/{ratio}/{theme}/theme.md` 读取：
- TOKENS — 颜色
- GRID / GRID_16x9 — 布局坐标
- TYPE / TYPE_16x9 — 字号字体
- findActiveSub() — 字幕查找

## 参考

- 老版本: `MediaAgentTeam/series/硅谷访谈/E01-.../frames/`
- 翻译数据: `MediaAgentTeam/series/硅谷访谈/E01-.../translate/`
