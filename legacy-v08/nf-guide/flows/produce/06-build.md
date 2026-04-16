# Step 06 · Build HTML

## 命令（pin 死）

```bash
node src/nf-cli/bin/nextframe.js build \
  projects/v10-landscape/timeline.v08.json \
  --out projects/v10-landscape/out.html
```

竖屏同理，换 `v10-portrait`。

## 产物硬检查

```bash
ls -lh projects/v10-landscape/out.html
# 预期：> 50KB（含 scene bundle + 运行时 + timeline）

grep -c "__SLIDE_SEGMENTS\|layers" projects/v10-landscape/out.html
# 预期：≥ 1（说明 anchors 已成功展开为 layers / segments）

grep -c "SCENES\s*=" projects/v10-landscape/out.html
# 预期：≥ 1（scene bundle 已注入）
```

如果 `__SLIDE_SEGMENTS` / `layers` grep 计数 = 0 → **anchors 没展开**，build 静默失败 → 回 Step 05 查错误。

## 这一步实际发生什么

v0.8 builder 内部降级：

1. anchors 展开为绝对毫秒
2. v0.8 tracks → v0.3 layers[]（复用 v0.3 runtime，保证 recorder 兼容）
3. scene clips → layers（保留 effects/transition/opacity）
4. subtitle clips → 自动注入一个 subtitle layer
5. animation clips → 注入到目标 layer 的 params 作为 keyframes
6. audio → `__SLIDE_SEGMENTS.audio`（recorder 读）

> 关键理解：**v0.8 是"写格式"**（anchors × tracks），**v0.3 是"跑格式"**（layers），builder 是唯一桥。

## 常见错误 → 修法

| 错误 | 修法 |
|------|------|
| `UNSUPPORTED_SCENE_TYPE: scene xxx has type=canvas` | scene 有非法 type，回 component flow 改 `type: dom` |
| `scene id not found: xxx` | scene 文件没注册 / scene id 拼错，跑 `nextframe scenes` 查 |
| `MISSING_ANCHOR: s0.begin` | anchors.json 没对应字段，回 Step 03 |
| build 成功但 grep `__SLIDE_SEGMENTS` = 0 | timeline 缺 `"version": "0.8"`，被当 legacy | 

## 下一步

```bash
cargo run -p nf-guide -- produce record
```
