# 01 — Data Contract

Timeline JSON 是整个产品的血液。CLI 写它、编辑器改它、recorder 读它、AI 操作它。

## Timeline JSON Schema

### 顶层
```json
{
  "version": "0.3",
  "width": 1920,
  "height": 1080,
  "fps": 30,
  "tracks": []
}
```

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| version | string | Y | semver 格式，当前 "0.3" |
| width | number | Y | ≥360, ≤7680 |
| height | number | Y | ≥360, ≤7680 |
| fps | number | N | 默认 30，允许 24/25/30/60 |
| tracks | Track[] | Y | 至少 1 条 |

### Track
```json
{
  "id": "track-0",
  "type": "visual",
  "clips": []
}
```

### Clip (Layer)
```json
{
  "id": "clip-0",
  "scene": "headline",
  "start": 0,
  "dur": 5,
  "x": 0, "y": 0, "w": 100, "h": 100,
  "params": {},
  "enter": "fadeIn",
  "exit": "fadeOut",
  "keyframes": {}
}
```

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| id | string | Y | 唯一 |
| scene | string | Y | 必须在 scene registry 中 |
| start | number | Y | ≥0，秒 |
| dur | number | Y | >0，秒 |
| x, y, w, h | number | N | 百分比 0-100，默认全屏 |
| params | object | Y | 由 scene 定义 |
| enter/exit | string | N | 动画名，见 fx 库 |
| keyframes | object | N | 属性名 → [[time, value], ...] |

## 版本兼容规则

1. **只增不删** — 新版本只加字段，不删旧字段
2. **默认值兜底** — 新字段必须有默认值，旧 timeline 打开不报错
3. **version 字段** — 解析时检查 version，低版本走兼容路径
4. **迁移函数** — 每个大版本一个 migrate() 函数：v0.2→v0.3、v0.3→v0.4

## Project 三级结构

```
~/NextFrame/projects/
├── {project}/
│   ├── project.json        ← 项目配置
│   └── {episode}/
│       └── {segment}.json  ← timeline
```

| 层级 | 命名规则 | 约束 |
|------|---------|------|
| project | kebab-case | 唯一 |
| episode | kebab-case | 项目内唯一 |
| segment | kebab-case | 集内唯一 |

## Pipeline JSON (v0.4)

```json
{
  "script": { "text": "", "style": {} },
  "audio": { "segments": [] },
  "atoms": [],
  "clips": [],
  "output": { "renders": [] }
}
```

Pipeline 是 segment 的扩展视图，不是独立格式。一个 segment 对应一个 pipeline。

## 规则

- 所有 JSON 必须能被 `JSON.parse()` 解析 — 不允许注释、trailing comma
- 数值精度：时间用秒（float），最多 3 位小数
- 路径用相对路径（相对于 project 根）
- 颜色用 hex（#rrggbb）或 rgba()
