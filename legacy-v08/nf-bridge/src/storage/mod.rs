//! storage module exports
pub(crate) mod autosave;
pub(crate) mod fs;
pub(crate) mod recent;

#[cfg(test)]
pub(crate) use autosave::{
    autosave_storage_test_lock, set_autosave_storage_path_override_for_tests,
};
pub(crate) use autosave::{
    handle_autosave_clear, handle_autosave_list, handle_autosave_recover, handle_autosave_write,
};
#[cfg(test)]
pub(crate) use fs::resolve_write_path;
pub(crate) use fs::{
    handle_fs_list_dir, handle_fs_mtime, handle_fs_read, handle_fs_write, handle_fs_write_base64,
};
pub(crate) use recent::{handle_recent_add, handle_recent_clear, handle_recent_list};
#[cfg(test)]
pub(crate) use recent::{recent_storage_test_lock, set_recent_storage_path_override_for_tests};
