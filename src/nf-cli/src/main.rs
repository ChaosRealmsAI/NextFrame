//! nf-cli (v2.0, skeleton) — 最小 CLI。
//!
//! 三条命令（v2.0 不加第四条）：
//!   - `nf build <source.json>`    → 产 bundle.html
//!   - `nf record <source.json>`   → 产 4K MP4
//!   - `nf validate <source.json>` → 校验锚点/周期/viewport
//!
//! 骨架阶段：仅打印版本。

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let cmd = args.get(1).map(String::as_str).unwrap_or("--help");
    match cmd {
        "--version" | "-v" => println!("nf v0.1.0-skeleton"),
        _ => {
            println!("nf v2.0 skeleton — commands: build | record | validate");
            println!("(not implemented yet — waiting for nf-core-engine)");
        }
    }
}
