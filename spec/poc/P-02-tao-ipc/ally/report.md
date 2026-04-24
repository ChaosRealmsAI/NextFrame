---
agent: ally-gpt
status: pass
duration: PT31M
affects_scenarios: [S-01, S-02, S-03, S-04, S-05, S-06]
---

# POC P-02 - tao multi-window + Unix socket IPC

## Result

Pass for the requested v0.2 risk checks:

- Two tao windows are created in one process. Closing `w-1` through IPC leaves `w-2` alive and the process unchanged.
- Closing the last window does not exit the process. A later `open-window` IPC request creates `w-3` and returns within the 200 ms budget.
- Ten concurrent Unix socket IPC clients receive ten matched responses with the correct `req_id`.
- SIGTERM removes the filesystem socket, and a restart can bind the same path again.

Scope note: tao is a native windowing crate, not a webview. The POC represents the requested `about:blank`/`window.WINDOW_ID` distinction with native window titles plus app-state IDs (`w-1`, `w-2`, `w-3`). Actual HTML load and JS injection need the webview layer in a later integration test.

## Implementation

- Project: `src/`
- Main binary: `poc-tao-ipc`
- Client binary: `ipc-client`
- Dependencies: `tao = "0.27"`, `interprocess = "=2.2.3"`, `tokio`, `serde_json`, `ctrlc` with termination handling.
- IPC transport: filesystem Unix socket at `/tmp/nf-test-*.sock`.
- Concurrency model: one thread accepts local socket connections; each connection dispatches a request into tao's main event loop through `EventLoopProxy` and receives its own `mpsc` response channel.
- Cleanup model: stale socket is removed before bind; normal quit, event-loop destroy, and SIGTERM handler remove the socket path.

## Evidence

`tests/test1-multi-window.log`

```text
initial={"req_id":1,"ok":true,"data":{"process_id":31580,"window_count":2,"window_ids":["w-1","w-2"]},"error":null}
close_w1={"req_id":2,"ok":true,"data":{"process_id":31580,"window_count":1,"window_ids":["w-2"]},"error":null}
process_survived_close_1=yes
```

`tests/test2-reopen-after-close.log`

```text
process_survived_last_window=yes
open_after_last_close={"req_id":3,"ok":true,"data":{"elapsed_ms":5,"opened":"w-3","status":{"process_id":31767,"window_count":1,"window_ids":["w-3"]}},"error":null}
elapsed_ms=10
```

`tests/test3-concurrent-ipc.log`

```text
concurrent_demux_ok=10
```

The full log contains responses for `req_id` 1 through 10, each with `ok:true`.

`tests/test4-socket-cleanup.log`

```text
socket_removed_after_sigterm=yes
{"req_id":2,"ok":true,"data":{"process_id":34173,"window_count":2,"window_ids":["w-1","w-2"]},"error":null}
restart_bind_ok=yes
```

## Verification Commands

```bash
cd /Users/Zhuanz/bigbang/NextFrame/spec/poc/P-02-tao-ipc/ally/src
cargo fmt --check
cargo build

cd /Users/Zhuanz/bigbang/NextFrame/spec/poc/P-02-tao-ipc/ally/tests
./test1-multi-window.sh
./test2-reopen-after-close.sh
./test3-concurrent-ipc.sh
./test4-socket-cleanup.sh
```

All commands passed on the final run.
