# A3 Doctor Probe Fix Report

## Changed Files

- `crates/nf-cli/src/commands/doctor.rs`
- `A3-REPORT.md`

## Fix Mapping

1. PATH includes `$HOME/.cargo/bin`

```rust
fn probe_path(home: Option<&OsStr>, path: Option<&OsStr>) -> Option<OsString> {
    let mut paths = Vec::new();

    if let Some(home) = home.filter(|value| !value.is_empty()) {
        paths.push(PathBuf::from(home).join(".cargo/bin"));
    }

    if let Some(path) = path.filter(|value| !value.is_empty()) {
        paths.extend(std::env::split_paths(path));
    }

    if paths.is_empty() {
        None
    } else {
        std::env::join_paths(paths).ok()
    }
}
```

2. Probe timeout changed from 5s to 15s

```rust
const PROBE_TIMEOUT: Duration = Duration::from_secs(15);

fn command_stdout<I, S>(program: impl AsRef<OsStr>, args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    command_stdout_timeout(program, args, PROBE_TIMEOUT)
}
```

3. `which` fallback plus `$HOME/.cargo/bin/<bin>` fallback

```rust
fn locate_program(program: &OsStr, timeout: Duration) -> Option<PathBuf> {
    let program_path = Path::new(program);
    if program_path.components().count() != 1 {
        return None;
    }

    let which_args = [program.to_os_string()];
    if let Ok(output) = command_stdout_timeout_once(OsStr::new("which"), &which_args, timeout) {
        let path = first_line(&output);
        if !path.is_empty() {
            return Some(PathBuf::from(path));
        }
    }

    cargo_home_bin(program).filter(|path| path.exists())
}
```

## Tests Added

- `probe_path_prepends_cargo_bin`
- `probe_timeout_is_15_seconds`

## Verification

```text
cargo test --workspace --lib
24 passed

cargo check --workspace
PASS

cargo clippy --workspace -- -D warnings
PASS

cargo build --release --bin nf
PASS

cargo build --release --bin nf-shell
PASS
```

`cargo build --release --bin nf-shell` was run because `nf doctor` verifies `./target/release/nf-shell --version`.

## Doctor E2E Output

```text
✓    rust_toolchain     1.94                     (≥ 1.86)
✓    cargo              1.94                     (≥ 1.86)
✓    node               23.11                    (≥ 20)
✓    npm                10.9.2                   (present)
✓    nf_shell           nf-shell 0.2.0           (./target/release/nf-shell --version)
✓    socket             /tmp/nextframe-502.sock  (parent directory writable)
✓    home_nextframe     /Users/Zhuanz/.nextframe ($HOME/.nextframe writable)
✓    macos              26.0                     (≥ 13)
✓    display            WindowServer             (GUI session)

Summary: 9/9 pass · 0 fail · 0 warn
Overall: PASS
```

`rust_toolchain` and `cargo` both pass and no `timed out` text appears.

## Commit

No commit made.
