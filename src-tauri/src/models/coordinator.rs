use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CoordinatorRun {
    pub id: String,
    pub workspace_id: String,
    pub status: String,
    pub brain_profile_id: String,
    pub coder_profile_id: String,
    pub goal: String,
    pub last_response: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CoordinatorWorker {
    pub id: String,
    pub run_id: String,
    pub workspace_id: String,
    pub profile_id: String,
    pub status: String,
    pub last_prompt: Option<String>,
    pub last_session_id: Option<String>,
    pub notified_status: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CoordinatorAction {
    pub action: String,
    pub worker_id: Option<String>,
    pub prompt: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CoordinatorActionLog {
    pub id: String,
    pub run_id: String,
    pub workspace_id: String,
    pub action_kind: String,
    pub replay_kind: Option<String>,
    pub replayed_from_action_id: Option<String>,
    pub worker_id: Option<String>,
    pub prompt: Option<String>,
    pub message: Option<String>,
    pub raw_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCoordinatorStatus {
    pub workspace_id: String,
    pub mode: String,
    pub active_run: Option<CoordinatorRun>,
    pub workers: Vec<CoordinatorWorker>,
    pub recent_actions: Vec<CoordinatorActionLog>,
    pub planner_adapter: Option<String>,
    pub planner_parse_mode: Option<String>,
    pub planner_fallback: Option<bool>,
    pub planner_last_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartWorkspaceCoordinatorInput {
    pub workspace_id: String,
    pub goal: String,
    pub brain_profile_id: Option<String>,
    pub coder_profile_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StepWorkspaceCoordinatorInput {
    pub workspace_id: String,
    pub instruction: String,
    pub brain_profile_id: Option<String>,
    pub coder_profile_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayWorkspaceCoordinatorActionInput {
    pub workspace_id: String,
    pub action_id: String,
    pub prompt_override: Option<String>,
}
