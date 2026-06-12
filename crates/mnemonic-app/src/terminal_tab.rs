use std::path::PathBuf;

use gpui::{Entity, SharedString};
use terminal::Terminal;

pub(crate) struct TerminalTab {
    pub(crate) id: String,
    pub(crate) workspace_id: String,
    pub(crate) title: String,
    pub(crate) cwd: PathBuf,
    pub(crate) terminal: Option<Entity<Terminal>>,
    pub(crate) status: SharedString,
}

#[derive(Clone, Copy)]
pub(crate) enum TerminalLaunch {
    Shell,
    Claude,
}

#[derive(Clone, Copy)]
pub(crate) enum TerminalScroll {
    LineUp,
    LineDown,
    PageUp,
    PageDown,
    Top,
    Bottom,
}
