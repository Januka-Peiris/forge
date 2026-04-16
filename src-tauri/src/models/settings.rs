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
