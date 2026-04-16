use serde::{Deserialize, Serialize};

use crate::models::agent_profile::RawAgentProfile;
use crate::models::AgentProfile;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ForgeWorkspaceConfig {
    pub exists: bool,
    pub path: Option<String>,
    pub setup: Vec<String>,
    pub run: Vec<String>,
    pub teardown: Vec<String>,
    pub agent_profiles: Vec<AgentProfile>,
    pub warning: Option<String>,
}

impl Default for ForgeWorkspaceConfig {
    fn default() -> Self {
        Self {
            exists: false,
            path: None,
            setup: vec![],
            run: vec![],
            teardown: vec![],
            agent_profiles: vec![],
            warning: None,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RawForgeWorkspaceConfig {
    #[serde(default)]
    pub setup: Vec<String>,
    #[serde(default)]
    pub run: Vec<String>,
    #[serde(default)]
    pub teardown: Vec<String>,
    #[serde(default, alias = "agent_profiles")]
    pub agent_profiles: Vec<RawAgentProfile>,
}
