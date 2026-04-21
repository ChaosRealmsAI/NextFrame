//! nf-runtime — NextFrame render runtime.
//!
//! Drives the three modes (play / preview / export) on top of nf-engine,
//! holding P4 pixel-equality: `pixels(play) == pixels(preview) == pixels(export)`.
//! Scaffold only (v0.1.1). Backends land in v0.3+.
