# nf-cli (v2.0, skeleton)

**最小 CLI**。Rust。只有 3 条命令：

```
nf build    <source.json>   → bundle.html
nf record   <source.json>   → output.mp4 (4K)
nf validate <source.json>   → exit 0/1 + 错误清单
```

## 为什么 Rust 不 Node

- v1.0 用 Node CLI 跑 TS，依赖 tsx、启动慢
- v2.0 目标：单个原生二进制，无 runtime 依赖
- `nf-core-engine` 是 TS（为了和浏览器端语言一致）— CLI 通过 spawn `node` 或 `deno` 调 engine，但入口是 Rust

## 边界

- ❌ 不做 pipeline（download/transcribe/publish 是外围，v2.0 不管）
- ❌ 不做 scenes / timeline 列表 CLI（不鼓励 AI 靠 CLI 列组件，改读 `src/nf-tracks/` 目录）
- ✅ 做：build / record / validate + 结构化错误输出（JSON）

## 骨架阶段

`Cargo.toml` + `src/main.rs` 占位。后续逐步把子命令填入。

**骨架阶段仅占位。**
