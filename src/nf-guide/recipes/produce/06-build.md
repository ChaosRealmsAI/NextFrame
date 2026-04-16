# Step 06: Build HTML

## 命令

```bash
nextframe build timeline.json --out out.html
```

## 产物检查

```bash
ls -lh out.html
grep -n "__TIMELINE__" out.html
grep -n "__NF_V08__" out.html
```

至少确认：

- 产出了单文件 `out.html`
- HTML 里有 `window.__TIMELINE__`
- runtime 片段已内联

## 这一步应该发生什么

- builder 运行 fillers，把 anchors 展开成绝对毫秒
- scene 代码、subtitle 数据、animation 数据都被塞进 HTML
- browser runtime 暴露 `window.__NF_V08__.clock / sceneLoop / subtitle / anim / frame`
- 如果这一步失败，先回 Step 05 看具体错误码；常见原因是 anchor 名拼错或 clip/kind schema 不合法

## 下一步

```bash
nf-guide produce record
```
