use serde::{Deserialize, Serialize};

use crate::models::WorkspacePort;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceTerminalHealth {
    pub session_id: String,
    pub title: String,
    pub kind: String,
    pub profile: String,
    pub status: String,
    pub backend: String,
    pub tmux_alive: bool,
    pub attached: bool,
    pub stale: bool,
    pub last_output_at: Option<String>,
    pub recommended_action: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceHealth {
    pub workspace_id: String,
    pub status: String,
    pub terminals: Vec<WorkspaceTerminalHealth>,
    pub ports: Vec<WorkspacePort>,
    pub warnings: Vec<String>,
}
