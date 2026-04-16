use serde::{Deserialize, Serialize};

use super::repository::DiscoveredRepository;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub repo_roots: Vec<String>,
    pub discovered_repositories: Vec<DiscoveredRepository>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRepoRootsInput {
    pub repo_roots: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiModelSettings {
    /// Model used by Claude Code coding agents (e.g. "claude-sonnet-4-6").
    pub agent_model: String,
    /// Model used by the Opus orchestrator brain (e.g. "claude-opus-4-6").
    pub orchestrator_model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiModelSettingsInput {
    pub agent_model: String,
    pub orchestrator_model: String,
}
