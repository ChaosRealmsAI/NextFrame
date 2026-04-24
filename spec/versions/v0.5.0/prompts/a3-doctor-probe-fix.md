# A3 · nf doctor rust/cargo probe 修复

**CWD**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.5.0-A3-doctor`(基于 v0.2-integration 开新分支)

**目标**: 修 `nf doctor --human` 对 `rust_toolchain` + `cargo` 假 fail("timed out after 5s") · 其他系统 rust 明明装着(整个 build 过了)。

## 现状 bug

```
✗    rust_toolchain     not found                (≥ 1.86) hint: Install via https://rustup.rs/; timed out after 5s
✗    cargo              not found                (≥ 1.86) hint: Install via https://rustup.rs/; timed out after 5s
```

但 `rustc --version` 在 shell 里秒回。说明 doctor 的 probe 实现问题。

## 根因假设(3 个)

1. **PATH 没继承** · `std::process::Command::new("rustc")` 没扩 `~/.cargo/bin`
2. **timeout 5s 太短** · first-invocation 偶尔慢
3. **probe 命令错** · 可能打 `rustc --version --verbose` 或其他重命令 · stdio 阻塞

## 干啥

### Step 1 · 读源码定位

`crates/nf-cli/src/commands/doctor.rs` · 找 `check_rust_toolchain` + `check_cargo`(T-20 ally 写的)。

查:
- Command::new 怎么拼
- 有没有扩 PATH
- timeout 多少秒
- probe 命令啥

### Step 2 · 修 3 点

#### 2.1 · 扩 PATH 包含 `~/.cargo/bin`

```rust
fn run_probe(bin: &str, args: &[&str]) -> Option<String> {
    let mut cmd = Command::new(bin);
    // 继承 PATH · 加 ~/.cargo/bin 兜底
    let home = std::env::var("HOME").ok()?;
    let existing_path = std::env::var("PATH").unwrap_or_default();
    let extended_path = format!("{}/.cargo/bin:{}", home, existing_path);
    cmd.env("PATH", extended_path);
    cmd.args(args);
    // timeout 改 15s
    let output = cmd.output_with_timeout(Duration::from_secs(15)).ok()?;
    // ...
}
```

如没用 `output_with_timeout` · 可用 wait-thread pattern 或 `std::process::Command::output`(同步 · 无超时但阻塞)· **注意 unit test 要可控**。

#### 2.2 · timeout 5→15s

first run cargo/rustc cold start 可能 >5s。15s 给足 margin。

#### 2.3 · 加 fallback(可选)

若 `rustc --version` 失败 · 试 `which rustc` 拿路径 · 再执行:

```rust
fn locate_rust() -> Option<PathBuf> {
    // try PATH default
    if let Ok(out) = Command::new("which").arg("rustc").output() {
        if out.status.success() {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !p.is_empty() { return Some(PathBuf::from(p)); }
        }
    }
    // try ~/.cargo/bin
    let home = std::env::var("HOME").ok()?;
    let p = PathBuf::from(format!("{home}/.cargo/bin/rustc"));
    if p.exists() { return Some(p); }
    None
}
```

然后用 absolute path 跑 `Command::new(p)`。

### Step 3 · 单测补

不能测真 rustc(CI 可能没装) · 但测 probe 的 timeout 行为 + PATH 扩展:

```rust
#[test]
fn probe_uses_extended_path() {
    std::env::set_var("HOME", "/tmp/fake");
    std::env::set_var("PATH", "/usr/bin");
    // 验 run_probe 传给 Command 的 env["PATH"] 含 /tmp/fake/.cargo/bin
}

#[test]
fn probe_timeout_15s() {
    // ... 验 timeout 参数对
}
```

加 2 测试。

### Step 4 · 回归

`cargo test --workspace --lib` · 现有 22 测试 + 新 2 = 24 测试全过。

## 硬约束

- 不加新依赖(用 std · 不引 `tokio::process` 或 `async-process`)
- 不改 doctor 的 JSON 输出结构(只改 probe 内部)
- 不改 --human 格式

## 验收

- `cargo check --workspace` 零 warning · `cargo clippy -D warnings` 零 warning
- `cargo test --workspace --lib` 24+ pass
- **e2e 验**:
  ```sh
  cd .worktrees/v0.5.0-A3-doctor
  cargo build --release --bin nf
  ./target/release/nf doctor --human
  # rust_toolchain 必显 ≥ 1.86 ✓ · cargo 必显 ≥ 1.86 ✓ · 无 "timed out"
  ```
- 若本地 rust 真装着 · 9/9 pass(不是 7/9)

## 产出

- `A3-REPORT.md` · 修改文件 + 3 修复点对应代码段 + doctor --human 真实输出
- NO git commit

时间预算 30-45min。
