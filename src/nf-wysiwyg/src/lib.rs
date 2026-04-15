//! v0.7 WYSIWYG walking skeleton types, traits, and stub interfaces.

pub mod dom_snapshot;
pub mod edit_op;
pub mod mode;
pub mod scene_dom;
pub mod timeline;
pub mod wgpu_replay;

pub use dom_snapshot::DomSnapshot;
pub use edit_op::{apply, EditOp};
pub use mode::{data_mode_attr, Mode};
pub use scene_dom::SceneDom;
pub use timeline::{Layer, Timeline};
pub use wgpu_replay::{WgpuReplay, WgpuReplayNull};
