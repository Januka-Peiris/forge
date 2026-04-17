use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChatSession {
    pub id: String,
    pub workspace_id: String,
    pub provider: String,
    pub status: String,
    pub title: String,
    pub provider_session_id: Option<String>,
    pub cwd: String,
    pub raw_output: String,
    pub created_at: String,
    pub updated_at: String,
    pub ended_at: Option<String>,
    pub closed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChatEvent {
    pub id: String,
    pub session_id: String,
    pub seq: i64,
    pub event_type: String,
    pub role: Option<String>,
    pub title: Option<String>,
    pub body: String,
    pub status: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAgentChatSessionInput {
    pub workspace_id: String,
    pub provider: String,
    pub title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendAgentChatMessageInput {
    pub session_id: String,
    pub prompt: String,
    pub profile_id: Option<String>,
    pub task_mode: Option<String>,
    pub reasoning: Option<String>,
    pub claude_agent: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentChatEventEnvelope {
    pub workspace_id: String,
    pub session: AgentChatSession,
    pub event: AgentChatEvent,
}
