# P1 · frame pure (硬门禁)

## 守护

**charter principle P3 死约束** —— `frame(t, json) = pixels` 是纯函数 · 同一 t 同一 JSON 永远同一像素。

视频产品最容易被破坏的不变式。破了 = 同样 JSON 跑两次出不同帧 · export 对不齐 preview · 后面 P2 (3 模式像素) 全跟着崩。

## 规则

### 禁用模式(grep 可查)

| 模式 | 说明 |
|---|---|
| `Date.now()` / `std::time::SystemTime::now()` | 挂钟时间 · 每次不同 |
| `Instant::now()` | 单调时钟 · 每次不同 |
| `Math.random()` / `rand::random()` / `thread_rng` 未 seed | 随机 · 每次不同 |
| `fetch(` / `reqwest::get` 未缓存 | 网络结果不确定 · 每次不同 |
| 全局 `static mut` / `OnceLock` 运行时改 | 隐式状态 |

### 允许模式

- 时间从参数 `t: f64` 传进来 · 不从环境读
- 随机用 `StdRng::seed_from_u64(json.seed)` · seed 进 JSON · 可复现
- 网络资源在 build 阶段预下载 + hash 缓存 · render 阶段只读缓存

### 属性测试(property test)

`nf-engine` 必有:

```rust
#[test]
fn frame_is_pure() {
    let json = sample_project();
    for t in [0.0, 1.5, 5.0, 10.0] {
        let a = frame(t, &json);
        let b = frame(t, &json);
        assert_eq!(a.pixels(), b.pixels(), "frame({t}) not pure");
    }
}
```

每次 PR 必跑 · CI gate。

## check

```bash
./scripts/audit-pure.sh
```

checker 逻辑:

```bash
# 1. grep 禁用模式
rg -n 'Date::now|Instant::now|SystemTime::now|Math\.random|thread_rng\(\)' crates/nf-engine crates/nf-runtime frontend/
# 非零 = 违约 · 需 #[allow] + 注释说理由

# 2. 跑 pure test
cargo test -p nf-engine frame_is_pure
cargo test -p nf-runtime frame_is_pure
```

## 评分

| 分 | 状态 |
|---|---|
| **A=10** | 0 禁用模式 · property test 绿 · 跑 10 次输出字节 hash 一致 |
| **B=8** | property test 绿 · 有 allow 禁用但带完整注释 · 数量 ≤ 3 |
| **C=6** | 有 4+ allow · property test 绿 |
| **D=4** | property test 出现偶发失败 / 有禁用模式无 allow |
| **F=0** | property test 持续红 / 无 property test |

## 门禁

**D/F = 阻合并**。这是项目死约束 · 破不起。

## 现状 (v0.1.1 骨架)

- engine / runtime 零实现 · 没代码可扫 → **N/A**(基线不打分)
- property test 框架: v0.3 engine 建时必 day-1 上

## 关联

- charter P3 (frame pure) · P4 (3 模式像素)
- `ai-coding-mindset` rule §6 (POC 先行)
- v1.67 4K quality 教训: frame pure 破损 → 4K export 失败
