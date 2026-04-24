# W · workspace 融合 · v0.5.1 + main 14 crates

**CWD**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.6.0-299177e4`(基于 main · 14 crates 已在)

**目标**: 把 v0.5.1 的 nf-cli/nf-shell 覆盖 main 的同名 4 crate · 保留 karaoke subcommand · workspace cargo check/test 全绿 · 两个 e2e 双验证。

## 参考源码位置

- **v0.5.1 source**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.5.1-299177e4/crates/{nf-cli,nf-shell,nf-engine,nf-runtime}/`(完整 content)
- **v0.5.1 frontend**: `/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.5.1-299177e4/frontend/nf-components/`(完整 content)
- **当前 main · base**: 14 crates 已在 CWD `crates/` 下 · `crates/{nf-cli,nf-shell}` 是 v0.3.0 小 scaffold 要被覆盖

## 干啥(按顺序)

### Step 1 · 备份 main 的 karaoke

```sh
# main 的 nf-cli karaoke 实现要保
cp crates/nf-cli/src/commands/karaoke.rs /tmp/keep-karaoke.rs
cp crates/nf-cli/src/error.rs /tmp/keep-nf-cli-error.rs  # 可能需要
cp crates/nf-cli/src/io_json.rs /tmp/keep-nf-cli-io-json.rs  # karaoke 依赖
```

### Step 2 · 覆盖 4 crates

```sh
# 清掉 main 的 nf-cli/nf-shell/nf-engine/nf-runtime
rm -rf crates/nf-cli crates/nf-shell crates/nf-engine crates/nf-runtime

# 复制 v0.5.1 的 4 crates
cp -r /Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.5.1-299177e4/crates/nf-cli crates/
cp -r /Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.5.1-299177e4/crates/nf-shell crates/
cp -r /Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.5.1-299177e4/crates/nf-engine crates/
cp -r /Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.5.1-299177e4/crates/nf-runtime crates/

# 复制 v0.5.1 frontend(覆盖或 merge)
rm -rf frontend
cp -r /Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.5.1-299177e4/frontend .
```

### Step 3 · karaoke subcommand 接入 v0.5.1 nf-cli clap tree

读 `/tmp/keep-karaoke.rs` · 理解 karaoke 接口(`fn run(episode_dir: &Path) -> NfResult<...>`)。

在 `crates/nf-cli/src/commands/mod.rs` 的 `Commands` enum 加:

```rust
#[derive(Subcommand)]
enum Commands {
    // ... 已有 Projects / Episodes / Clips / Anchors / Log / Doctor / ... ...
    Karaoke(KaraokeArgs),
}

#[derive(Debug, Args)]
pub struct KaraokeArgs {
    #[arg(
        help = "Episode directory path(含 clips.json + words.json + translations.zh.json)",
        value_name = "EPISODE_DIR"
    )]
    pub episode_dir: PathBuf,
}
```

把 `/tmp/keep-karaoke.rs` 复制到 `crates/nf-cli/src/commands/karaoke.rs`(适配 v0.5.1 的 errors 模块 · 可能 NfError vs nf_cli::error 要调)。

`crates/nf-cli/src/main.rs` dispatch 加:

```rust
Commands::Karaoke(args) => {
    commands::karaoke::run(&args.episode_dir)?;
}
```

### Step 4 · nf-cli Cargo.toml 加 videocut-* / nf-tts 等 karaoke 依赖

检查 `/tmp/keep-karaoke.rs` 的 `use` · 找依赖:可能需要:
- `videocut-core`(types)
- `videocut-cut`(clip 处理)
- `nf-tts`(TTS)
- `nf-guide`(flow guide)

在 `crates/nf-cli/Cargo.toml` [dependencies] 加:
```toml
videocut-core = { path = "../videocut-core" }
videocut-cut = { path = "../videocut-cut" }
nf-tts = { path = "../nf-tts" }
# 等 karaoke.rs 实际 use 的
```

### Step 5 · Cargo.toml workspace 校验

**root Cargo.toml**(`/Users/Zhuanz/bigbang/NextFrame/.worktrees/v0.6.0-299177e4/Cargo.toml`)不动 · 已有 14 members。但要核对 v0.5.1 的 `[workspace.package]` edition 2021 → 2024 · rust-version 1.80 → 1.86 · version 0.2.0 → 0.4.0 · **各 crate 的 Cargo.toml 继承 workspace.package 的 · 不用改**。

但如果 v0.5.1 的 `crates/nf-cli/Cargo.toml` 硬编码了 edition/version/rust-version · 改成 `workspace = true`:

```toml
[package]
name = "nf-cli"
version.workspace = true
edition.workspace = true
rust-version.workspace = true
```

### Step 6 · Cargo.lock 重生

```sh
cargo build --workspace 2>&1 | tail -20
# 如果依赖冲突(crate 版本不兼容)· 按报错修
```

常见冲突:
- v0.5.1 用 `tao = "0.35"` + `wry = "0.55"` · main 其他 crate 可能用不同版本
- clippy lints:main 老 crate 可能 deny 5 条 · v0.5.1 deny 6 条(加了 wildcard_imports)· 统一到更严的(留 workspace.lints.clippy 覆盖)

### Step 7 · 验证

```sh
# 1. 编译
cargo check --workspace 2>&1 | tail -5
cargo clippy --workspace --all-targets -- -D warnings 2>&1 | tail -5

# 2. 测试
cargo test --workspace --lib 2>&1 | grep "test result" | head -10
# 期望 ≥ 28 pass(v0.5.1 28 + main karaoke tests if any)

# 3. e2e v0.5.1 能力
cargo build --release --bins 2>&1 | tail -3
mkdir -p tmp/verify
HOME="$PWD/tmp/verify" ./target/release/nf-shell > tmp/shell.log 2>&1 &
sleep 2
HOME="$PWD/tmp/verify" ./target/release/nf projects create --slug=v6 --name='v0.6'
HOME="$PWD/tmp/verify" ./target/release/nf episodes create --project=v6 --slug=ep-01 --duration=10
HOME="$PWD/tmp/verify" ./target/release/nf open --project=v6 --episode=ep-01
HOME="$PWD/tmp/verify" ./target/release/nf capture --project=v6 --episode=ep-01 --out=tmp/v6-cap.png
file tmp/v6-cap.png  # 必 PNG 3016x1936 @ retina 2x
HOME="$PWD/tmp/verify" ./target/release/nf quit

# 4. e2e v0.3.0 karaoke 能力
# 如 reference/v0.x-final/src 或 reference/ 有 episode sample data · 跑:
# ./target/release/nf karaoke <sample-episode-dir>
# 若无 sample · 测 --help 能显 · subcommand 不崩
./target/release/nf karaoke --help
```

### Step 8 · report

`W-REPORT.md` at CWD root · 含:
- workspace 14 crates 状态 + Cargo.toml diff
- karaoke 接入路径 + 测试结果
- cargo check/clippy/test 数字
- e2e nf capture + nf karaoke 输出
- 预计下版本(v0.6.1)候选项

## 硬约束

- **不 fallback**(不加 feature flag 隔离 karaoke)· karaoke 作为正式 subcommand
- **不改 karaoke 功能实现** · 只改集成(enum 接入 + dependency 声明)
- **edition 2024 统一** · rust-version 1.86 统一
- **cargo test 28+ pass** · 任一原 v0.5.1 test fail = block
- **nf capture + nf karaoke 两个 e2e 双验** · 合并后两个都不能坏
- 时间预算 1-2h · blocker >15min 记 REPORT 停

## 产出

- `W-REPORT.md`(workspace 合并报告)
- 代码改动 · NO git commit(主 agent 统一 commit)
- `tmp/v6-cap.png`(e2e PNG · 主 agent 亲 Read 验)
