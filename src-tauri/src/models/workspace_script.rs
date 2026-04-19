use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

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
    pub mcp_servers: Vec<ForgeMcpServerConfig>,
    pub mcp_warnings: Vec<String>,
    pub warning: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ForgeMcpServerConfig {
    pub id: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub env: BTreeMap<String, String>,
    pub url: Option<String>,
    pub enabled: bool,
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
            mcp_servers: vec![],
            mcp_warnings: vec![],
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
    #[serde(default, alias = "mcpServers", alias = "mcp")]
    pub mcp_servers: Value,
}
