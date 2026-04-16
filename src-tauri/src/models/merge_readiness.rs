use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceMergeReadiness {
    pub workspace_id: String,
    pub merge_ready: bool,
    pub readiness_level: String,
    pub reasons: Vec<String>,
    pub warnings: Vec<String>,
    pub ahead_count: Option<u32>,
    pub behind_count: Option<u32>,
    pub active_run_status: Option<String>,
    pub review_risk_level: Option<String>,
    pub generated_at: String,
}
