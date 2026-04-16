use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AgentContextWorktree {
    pub repo_id: String,
    pub repo_name: String,
    pub path: String,
    pub branch: Option<String>,
    pub head: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAgentContext {
    pub workspace_id: String,
    pub primary_path: String,
    pub linked_worktrees: Vec<AgentContextWorktree>,
    pub prompt_preamble: String,
}
