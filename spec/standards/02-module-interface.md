# 02 — Module Interface

Rust ↔ JS 的唯一通道是 IPC 方法。每个方法是一个契约。

## IPC 协议

```
Request:  { id: string, method: string, params: object }
Response: { id: string, ok: bool, result: any, error: string? }
```

- 同步调用：JS bridgeCall(method, params) → Promise<result>
- 超时：默认 30s，长操作（export）不限
- 错误：error 字段是人可读字符串，含 fix 建议

## 方法命名约定

```
{domain}.{action}
```

- domain: fs, project, episode, segment, timeline, scene, export, autosave, recent, compose, preview, log
- action: camelCase 动词（list, create, load, save, start, cancel, write, read）

## 方法清单（31 个）

### fs（文件系统，8 个）
| 方法 | 入参 | 出参 | 副作用 |
|------|------|------|--------|
| fs.read | { path } | string | 无 |
| fs.write | { path, content } | null | 写文件 |
| fs.writeBase64 | { path, data } | null | 写二进制 |
| fs.listDir | { path } | string[] | 无 |
| fs.dialogOpen | { filters? } | string? | 弹原生对话框 |
| fs.dialogSave | { defaultPath?, filters? } | string? | 弹原生对话框 |
| fs.reveal | { path } | null | Finder 中显示 |
| fs.mtime | { path } | number | 无 |

### project（项目管理，6 个）
| 方法 | 入参 | 出参 |
|------|------|------|
| project.list | {} | Project[] |
| project.create | { name } | Project |
| episode.list | { project } | Episode[] |
| episode.create | { project, name } | Episode |
| segment.list | { project, episode } | Segment[] |
| segment.videoUrl | { project, episode, segment } | string |

### timeline（2 个）
| 方法 | 入参 | 出参 |
|------|------|------|
| timeline.load | { path } | Timeline JSON |
| timeline.save | { path, data } | null |

### export（4 个）
| 方法 | 入参 | 出参 |
|------|------|------|
| export.start | { path, output, width, height, fps, ... } | { pid } |
| export.status | { pid } | { status, progress, eta } |
| export.cancel | { pid } | null |
| export.muxAudio | { videoPath, audioPath, output } | null |

### autosave（4 个）
| 方法 | 入参 | 出参 |
|------|------|------|
| autosave.write | { projectId, data } | null |
| autosave.list | { projectId } | Entry[] |
| autosave.clear | { projectId } | null |
| autosave.recover | { projectId, entryId } | Timeline JSON |

### recent（3 个）
| 方法 | 入参 | 出参 |
|------|------|------|
| recent.list | {} | Entry[] |
| recent.add | { path, name } | null |
| recent.clear | {} | null |

### other（4 个）
| 方法 | 入参 | 出参 |
|------|------|------|
| scene.list | {} | Scene[] |
| compose.generate | { script, atoms, audio } | Timeline JSON |
| preview.frame | { path, time } | base64 PNG |
| log | { level, message } | null |

## 新增方法规则

1. 先在 `nf-bridge/src/lib.rs` dispatch 注册
2. handler 放到对应子模块（domain/storage/export/...）
3. 入参用 validation.rs 检查类型
4. 出参统一用 serde_json::Value
5. 错误信息格式：`"failed to {action}: {reason}. Fix: {suggestion}"`
6. 加集成测试到 `nf-bridge/tests/integration/`

## Shell HTTP API（AI 操控桌面端）

| 端点 | 方法 | 入参 | 出参 |
|------|------|------|------|
| /eval | POST | JS 表达式 | 执行结果 |
| /screenshot | GET | ?width=&height= | PNG |
| /navigate | POST | { page, project?, episode? } | null |
| /status | GET | - | { page, project, episode, segment } |
| /diagnose | GET | - | { health check } |
