# W-6 · 红队 · opus + ally 双视角

**触发时机**:W-1 ~ W-5 全 done · build.json tasks 95%+ done · cargo check workspace 零 warning · sonnet 盲测过。

## 目标

用黑客 / 漏洞 / 边界 / fuzz 视角攻击 v0.2 · 找出:
- 安全问题(路径遍历 · 命令注入 · socket 劫持 · shadow DOM XSS)
- 健壮性问题(并发 · EPIPE · 磁盘满 · 网络不可达但我们离线)
- 可用性问题(错误 hint 不够 · help 例子不实用 · 拒真用例)
- 一致性问题(spec ↔ 代码 ↔ BDD 三者 drift)
- 漏 scenarios(spec.json 27 scenarios 不够 · 需补)

## 两视角独立产 `redteam/{opus,ally}.md`

### OPUS 视角(深度思考 · 安全 · 架构)

攻击面:
1. **CLI 注入**:slug 含 `../` · `$(cmd)` · 换行 · NULL 字节 · shell metacharacters · Unicode
2. **Socket 劫持**:别的进程抢 bind /tmp/nextframe-$UID.sock · 伪造 IPC req
3. **Storage 并发**:两 nf 进程同时写 same project.json · 原子 rename 够吗?lost update?
4. **Shadow DOM XSS**:component attribute 含 `<img onerror>` · mock.json 含恶意 HTML
5. **wry WebView**:file:// URL 可读任意本地文件?CSP 策略?
6. **EventLoopProxy send 失败**:channel 满 · main thread 死
7. **spec ↔ 代码 drift**:interface.json 说 exit 5 · 代码实际返 exit 1 → BDD ai_tools FAIL
8. **架构漏**:缺 scenarios(如 `nf log` 分页?`nf clips update --start` 影响其他 clips 引用?锚点改后 clip 引用怎么 validate?)

产 `redteam/opus.md` · 列**5+ 具体漏洞**(含:路径 · 复现 cmd · 影响 · 修复建议)· Top 3 标 P0。

### ALLY 视角(OWASP / 机械 fuzz / 数字)

攻击面:
1. **OWASP CLI**:Injection · Broken Auth · Sensitive Exposure · XXE · Broken Access Control
2. **Fuzz slug**:长 1-100 char · Unicode(中日韩表情)· 空 · 特殊符
3. **Fuzz anchors expression**:`feat-1-end * 2` · `NaN` · `Infinity` · 循环引用
4. **Fuzz JSON**:manually 改 project.json · 坏 UTF-8 · 循环引用 · Schema 不对
5. **时间边界**:clip start=end · duration=0 · start > end · 负数
6. **并发压**:100 并发 `nf open` / `nf projects create`
7. **Rust lint 硬伤**:unwrap() · expect() · panic!() · unreachable() in nf-cli / nf-shell(workspace.lints deny 这些 · 若漏网就是 bug)

产 `redteam/ally.md` · 列**5+ 具体漏洞** + fuzz test 输入清单 + 发现的 crash/panic。

## 主 agent 整合

- 读两份 · 分类:P0 必修 / P1 建议 / P2 后续
- P0 新 scenarios → 回 spec.json items + 派新 build task(W-6 T-24)
- P1 记 `spec/mistakes.json`(跨版本教训)
- 所有问题 commit 含 `Mistake-ID:` trailer(commit-format rule)

## 硬约束

- **不 git commit**(主 agent 整合后 commit)
- **不修代码**(红队只找问题 · 修在 T-24 做)
- **不手软**:找不够 5 个 P0/P1 = 红队不尽职 · 要继续挖
- 时间 20-40min · 短 fuzz 足够产清单
