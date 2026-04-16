use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSession {
    pub id: String,
    pub workspace_id: String,
    pub session_role: String,
    pub profile: String,
    pub cwd: String,
    pub status: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub command: String,
    pub args: Vec<String>,
    pub pid: Option<u32>,
    pub stale: bool,
    pub closed_at: Option<String>,
    pub backend: String,
    pub title: String,
    pub terminal_kind: String,
    pub display_order: i64,
    pub is_visible: bool,
    pub last_attached_at: Option<String>,
    pub last_captured_seq: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputChunk {
    pub id: String,
    pub session_id: String,
    pub seq: u64,
    pub timestamp: String,
    pub stream_type: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionState {
    pub active_session: Option<TerminalSession>,
    pub latest_session: Option<TerminalSession>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputResponse {
    pub session: Option<TerminalSession>,
    pub chunks: Vec<TerminalOutputChunk>,
    pub next_seq: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub workspace_id: String,
    pub chunk: TerminalOutputChunk,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandApprovalEvent {
    pub session_id: String,
    pub workspace_id: String,
    /// The human-readable command text (stripped of trailing newlines).
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartTerminalSessionInput {
    pub workspace_id: String,
    pub profile: String,
    pub session_role: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub replace_existing: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceTerminalInput {
    pub workspace_id: String,
    pub kind: String,
    pub profile: String,
    pub profile_id: Option<String>,
    pub title: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachWorkspaceTerminalInput {
    pub workspace_id: String,
    pub session_id: String,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueAgentPromptInput {
    pub workspace_id: String,
    pub prompt: String,
    pub profile: Option<String>,
    pub profile_id: Option<String>,
    pub task_mode: Option<String>,
    pub reasoning: Option<String>,
    pub mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDispatchPromptInput {
    pub workspace_ids: Vec<String>,
    pub prompt: String,
    pub profile_id: Option<String>,
    pub task_mode: Option<String>,
    pub reasoning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPromptEntry {
    pub id: String,
    pub workspace_id: String,
    pub session_id: Option<String>,
    pub profile: String,
    pub prompt: String,
    pub status: String,
    pub created_at: String,
    pub sent_at: Option<String>,
}
