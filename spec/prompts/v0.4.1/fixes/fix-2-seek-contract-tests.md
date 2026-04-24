# Fix-2 · seek 契约 helpers unit tests

## cwd
`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.4.1-0912b6e2/`

## 根因(D3 P0-1)

`record_loop.rs:351-388` 和 `:461-650` 有 5 个私有函数实现 seek 契约:
- `verify_frame_ready` (解 `{t, frameReady, seq}` 契约 + 失败映射)
- `parse_json_result` (解 `await callAsync` 返 JSON string)
- `wait_for_export_seek_ready` (export 路径 settle 等待)
- `wait_for_video_state_ready` (video-state readiness 轮询)
- `js_number_as_u64` (number coercion)

**当前无 unit test · 只有 snapshot happy path 间接过**. 失败路径(frameReady=false/缺 seq/t 超容差/非 JSON/stale seq/video-state 畸形)全 blind.

## 修法

1. 把 5 函数改 `pub(crate)`(如果还是 private)
2. 在 `record_loop.rs` 文件末加 `#[cfg(test)] mod tests` 或新建 `record_loop_tests.rs`
3. 测 6 路径:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    // 1. frameReady=false · 应返 RecordError::FrameReadyContract
    #[test]
    fn seek_result_frame_ready_false_rejected() {
        let payload = r#"{"t": 0, "frameReady": false, "seq": 0}"#;
        let result = verify_frame_ready(payload, 0, 0);
        assert!(matches!(result, Err(RecordError::FrameReadyContract(_))));
    }

    // 2. 缺 seq · 应返 FrameReadyContract
    #[test]
    fn seek_result_missing_seq_rejected() { ... }

    // 3. t 超容差(expected 0 · actual 100 · 容差 33)· 应返 FrameReadyContract
    #[test]
    fn seek_result_t_out_of_tolerance_rejected() { ... }

    // 4. 非 JSON string · parse_json_result 应返 FrameReadyContract
    #[test]
    fn parse_json_result_malformed_rejected() { ... }

    // 5. stale seq(expected 5 · actual 3 · 乱序)· 应返 FrameReadyContract
    #[test]
    fn seek_result_stale_seq_rejected() { ... }

    // 6. video-state 畸形 · wait_for_video_state_ready 应返 Timeout 或 Contract
    #[test]
    fn video_state_malformed_timeout() { ... }
}
```

**重要**: 不 mock WKWebView / MacHeadlessShell · 只测这 5 helper 的**纯逻辑**(输入 JSON string + expected t/seq → 输出 Result).

## 验

```bash
cd crates/nf-recorder
cargo test -p nf-recorder --lib 2>&1 | tail -20    # 新 tests 通过
cargo clippy -p nf-recorder --all-targets 2>&1 | tail -5
```

## 禁

- ❌ 改 seek 契约业务逻辑(只补测试)
- ❌ 修其他文件
- ❌ 动 pub API
