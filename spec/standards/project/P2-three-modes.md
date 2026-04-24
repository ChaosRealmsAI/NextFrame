# P2 · 3 模式像素一致 (硬门禁)

## 守护

**charter principle P4 死约束** —— `pixels(play) == pixels(preview) == pixels(export)`。

视频产品最常踩的坑: **preview 正常 · export 黑屏 / 颜色错 / 帧错位**。此条为此刻死 · 三模式必须从地基对齐。

## 规则

### 硬约束

- 三模式走同一 render pipeline(`nf-engine::frame(t, json)`)· 禁各模式独立 pipeline
- 三模式用同一色彩空间 · 同一精度 · 同一采样时间戳
- **禁**:
  - preview 用 canvas 2D 画 · export 用 CPU 软渲 · play 用 GPU —— 三条路 · 必然 drift
  - preview 跑 30fps · export 跑 60fps 插值 —— 时间不对齐
  - preview 低清预览 · export 高清重算 —— 精度 drift

### 强制 diff 测

`nf-runtime` 必有集成测试:

```rust
#[test]
fn three_modes_pixel_equal() {
    let json = sample_project();
    let timestamps = [0.0, 2.5, 5.0, 12.34];
    for t in timestamps {
        let play    = render_play(t, &json);
        let preview = render_preview(t, &json);
        let export  = render_export(t, &json);

        assert_eq!(hash(&play), hash(&preview), "play != preview at t={t}");
        assert_eq!(hash(&preview), hash(&export), "preview != export at t={t}");
    }
}
```

hash 建议用 blake3 / sha256 逐字节。

### 持续 harness

`nf-runtime` 内建 CLI:

```bash
nf diff-modes --project=sample.json --timestamps=0,2.5,5,12.34
# 输出 3 模式像素差异 · > 0 即 fail
```

人类 / CI / AI 都能跑。

## check

```bash
./scripts/audit-three-modes.sh
```

```bash
cargo test -p nf-runtime three_modes_pixel_equal
# 另跑 harness:
cargo run -p nf-cli -- diff-modes --project=crates/nf-runtime/fixtures/sample.json --timestamps=0,2.5,5
```

## 评分

| 分 | 状态 |
|---|---|
| **A=10** | diff 测 100% 过 · `nf diff-modes` 任意 JSON 返回 0 差异 |
| **B=8** | 差异 ≤ 1/1e6 像素(浮点精度舍入可接受)· 10 个 fixture 全过 |
| **C=6** | 10 个 fixture 过 8 · 2 个小 drift(已记 bug) |
| **D=4** | 小部分 drift / 少测 timestamp |
| **F=0** | 有 mode 崩 / 黑屏 / 大面积差 |

## 门禁

**D/F = 阻 export 发版**。视频产品命门 · 破了就是废品。

## 现状 (v0.1.1 骨架)

- engine / runtime 零实现 → **N/A**(基线不打分)
- 未来策略: v0.3 建 engine 时 day-1 上 fixture · v0.4 建 runtime 时三模式 diff 测一起上

## 关联

- charter P4 (3 模式像素一致) · P3 (frame pure · P2 的前置)
- v1.67.x 4K quality 历史: export 黑屏 / rate-control 崩 / async flush —— 本标准的反面教材
- 每版本 BDD 必含 `visual` 类型 scenario 走 P2 diff(见 bdd-scaffold skill)
