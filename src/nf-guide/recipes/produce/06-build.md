# Step 06: Build HTML

## 命令

```bash
nextframe build timeline.json --out out.html
```

## 产物检查

```bash
ls -lh out.html
grep -c "TIMELINE" out.html
grep -c "SCENES" out.html
```

至少确认：

- 产出了单文件 `out.html`
- HTML 里有 `TIMELINE` 和 `SCENES`

## 这一步实际发生什么

v0.8 builder 内部做了**降级**：

1. 把 anchors 展开成绝对毫秒
2. **v0.8 tracks → v0.3 layers[]**（复用 v0.3 runtime，保证 recorder 兼容）
3. scene clips → layers（保留 effects/transition/opacity）
4. subtitle clips → 自动注入一个 `subtitleBar` layer（SRT 格式）
5. animation clips → 注入到目标 layer 的 params 里作为 keyframes
6. audio → `__SLIDE_SEGMENTS.audio`（recorder 读取）

> 关键理解：v0.8 是**写的格式**（anchors × tracks），v0.3 是**跑的格式**（layers）。builder 负责翻译。

如果失败，先回 Step 05 看具体错误码。常见原因：anchor 名拼错、scene id 不存在（用 `nextframe scenes` 查）。

## 下一步

```bash
nf-guide produce record
```
