# 任务 · v0.22.1 · 加 `nf devtools --eval=<js>` 跟 console 转发

主 agent 持锁 `feature:v0.22.1-cue`。你是路 D · 给产品 nf CLI 加"在 webview 跑 JS"和"console 转发"两个能力 · 让 AI 能远程调试桌面端 webview。这是 harness 工具墙缺的 · 必造。

## 工作根
```
/Users/Zhuanz/workspace/NextFrame/.worktrees/v0.22.1-0e3c8b70
```

## 必读

```bash
cat crates/nf-cli/src/commands/app.rs                          # devtools 实现
grep -B2 -A20 "fn devtools\|run_devtools" crates/nf-cli/src/commands/app.rs | head -50
cat crates/nf-shell/src/handlers/app.rs | head -80              # IPC handlers
grep -B2 -A10 "with_custom_protocol\|web_view\|evaluate" crates/nf-shell/src/webview.rs | head -30
ls crates/nf-shell-mac/src/headless/                            # mac eval 实现参考
grep -B2 -A20 "evaluateJavaScript\|callAsync" crates/nf-shell-mac/src/headless/mac.rs | head -40
```

## harness preflight

```bash
harness tools
harness search "eval"
harness search "console"
harness search "devtools"
```

## 交付 2 件

### 1) `nf devtools --eval=<js>` 在 webview 同步跑 JS

新增 flag。逻辑:
- IPC 发 `devtools.eval` 给 nf-shell · payload `{js: "<code>", window_id}`
- nf-shell 在主 webview 跑 `web_view.evaluate_script(<js>)` 或 `evaluateJavaScript_completionHandler`(看 wry / objc2-web-kit API)
- 返回结果 JSON · 包含 `{value: <serialized>, error: <if any>}`
- stdout 输出:`{"eval":"<truncated 200 chars>","value":...,"error":null}`

**用法示例**:
```bash
nf devtools --project=v021-explain --episode=main --eval='document.querySelectorAll("[data-nf-component]").length'
# {"eval":"document.querySelectorAll...","value":0,"error":null}

nf devtools --project=v021-explain --episode=main --eval='JSON.stringify(window.__nf_diag||{})'
# {"value":"{\"compositionSource\":null,...}",...}

nf devtools --project=v021-explain --episode=main --eval='document.querySelectorAll("[data-nf-preview-layers]")[0]?.children.length'
# {"value":0}
```

**注意** · 安全:eval 字符串里如果含 `</script>` 之类需要正确 escape · 但因为是 IPC JSON 传 · 应自动处理。

### 2) `nf-shell` console 转发 · webview 内 console.log/error 写到 nf-shell stdout

让 webview 的 `console.log/error/warn/info` 调用 fwd 到 nf-shell stdout(JSONL · 可选)。

实现思路:
- 在 nf-shell webview 启动时 inject 一段 init script:
  ```js
  ['log','warn','error','info'].forEach(level => {
    const orig = console[level];
    console[level] = function(...args) {
      try {
        window.ipc?.postMessage(JSON.stringify({type:'console', level, args: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a))}));
      } catch(_e){}
      return orig.apply(console, args);
    };
  });
  ```
- nf-shell IPC handler 收 `console` 消息 · 写到 stdout 行 `NFCONSOLE [level] <message>`
- AI 跑 `target/debug/nf-shell 2>&1 | grep NFCONSOLE` 即可看 webview log

**或者**(更简单) · 加 `nf devtools --console-tail=<n>` 命令 · 从 nf-shell 内部 buffer 拿最近 N 条 console 消息。但 buffer 设计复杂 · 优先选 stdout 转发。

## 自验

```bash
cargo build -p nf-cli -p nf-shell
target/debug/nf-shell > /tmp/shell.log 2>&1 &
sleep 4
target/debug/nf open --project=v021-explain --composition=main --episode=main
sleep 3

# Test 1 · eval 简单表达式
target/debug/nf devtools --project=v021-explain --episode=main --eval='1+1'
# 预期 {"value":2,...}

# Test 2 · DOM 查询
target/debug/nf devtools --project=v021-explain --episode=main --eval='document.body.children.length'
# 预期 {"value":N>0,...}

# Test 3 · console 转发(打开 stdout 看)
target/debug/nf devtools --project=v021-explain --episode=main --eval='console.log("hello from eval")'
grep NFCONSOLE /tmp/shell.log
# 预期看到 NFCONSOLE [log] hello from eval

# Test 4 · 看 v021-explain composition 渲染状态
target/debug/nf devtools --project=v021-explain --episode=main --eval='JSON.stringify({prevLayers: document.querySelectorAll("[data-nf-preview-layers]")[0]?.children.length, body: document.body.dataset.mode})'
# 预期诊断信息
```

## harness 注册

跑完先 `harness ask "..."` 拿 ASK 号 · 然后 `harness register nf-devtools-eval --usage='...' --resolves ASK-NNNN`。同样 console 转发也注册 `nf-shell-console-tail` 或类似。

## 禁

- 不动 v3 schema · 不动现有 nf devtools 其他 flag(--query/--get/--fill 保留)
- 不 commit / 不 push

## 报告

- ✅/❌ `nf devtools --eval=...` 跑通 · 4 个 test cases 都过
- ✅/❌ console 转发跑通 · grep NFCONSOLE 有输出
- ✅/❌ 跑了 v021-explain 的 composition 状态诊断 eval(看 compositionSource 是不是 null · preview-layers 有几个 children)
- ✅/❌ harness register 进工具墙
- 一句话 · 实现 + 关键 v021-explain 诊断结果(为路 E 留线索)
