#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Mode {
    Edit,
    Export,
    Record,
}

pub fn data_mode_attr(mode: Mode) -> &'static str {
    match mode {
        Mode::Edit => "edit",
        Mode::Export => "export",
        Mode::Record => "record",
    }
}
