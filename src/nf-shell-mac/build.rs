// build.rs · 兜 FM-RUNTIME-IIFE-STALE
// runtime.js src 或 track JS 改动后必须 rebuild · 这里声明 rerun-if-changed
// 让 cargo 知道产物依赖这些文件

fn main() {
    // runtime IIFE 产物（由 src/nf-runtime/scripts/emit-iife.mjs 生成）
    println!("cargo:rerun-if-changed=../nf-runtime/dist/runtime-iife.js");

    // 7 官方 Track
    println!("cargo:rerun-if-changed=../nf-tracks/official/video.js");
    println!("cargo:rerun-if-changed=../nf-tracks/official/bg.js");
    println!("cargo:rerun-if-changed=../nf-tracks/official/scene.js");
    println!("cargo:rerun-if-changed=../nf-tracks/official/chart.js");
    println!("cargo:rerun-if-changed=../nf-tracks/official/data.js");
    println!("cargo:rerun-if-changed=../nf-tracks/official/subtitle.js");
    println!("cargo:rerun-if-changed=../nf-tracks/official/audio.js");
}
