use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePrDraft {
    pub workspace_id: String,
    pub title: String,
    pub summary: String,
    pub key_changes: Vec<String>,
    pub risks: Vec<String>,
    pub testing_notes: Vec<String>,
    pub generated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspacePrResult {
    pub workspace_id: String,
    pub pr_url: String,
    pub pr_number: i64,
    pub title: String,
}
