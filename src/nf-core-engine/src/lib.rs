//! Metadata-only Rust workspace member for the v2.0 architecture graph.

pub fn package_name() -> &'static str {
    env!("CARGO_PKG_NAME")
}
