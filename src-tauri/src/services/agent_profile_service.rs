use std::collections::BTreeMap;

use crate::models::agent_profile::RawAgentProfile;
use crate::models::AgentProfile;
use crate::repositories::settings_repository;
use crate::services::workspace_script_service;
use crate::state::AppState;

const APP_AGENT_PROFILES_KEY: &str = "agent_profiles";

pub fn list_workspace_agent_profiles(
    state: &AppState,
    workspace_id: Option<&str>,
) -> Result<Vec<AgentProfile>, String> {
    let mut profiles = default_profiles()
        .into_iter()
        .map(|profile| (profile.id.clone(), profile))
        .collect::<BTreeMap<_, _>>();

    for profile in list_app_agent_profiles(state)? {
        profiles.insert(profile.id.clone(), profile);
    }

    if let Some(workspace_id) = workspace_id {
        if let Ok(config) =
            workspace_script_service::get_workspace_forge_config(state, workspace_id)
        {
            for profile in config.agent_profiles {
                profiles.insert(profile.id.clone(), profile);
            }
        }
    }
    Ok(profiles.into_values().collect())
}

pub fn list_app_agent_profiles(state: &AppState) -> Result<Vec<AgentProfile>, String> {
    let Some(value) = settings_repository::get_value(&state.db, APP_AGENT_PROFILES_KEY)? else {
        return Ok(vec![]);
    };
    parse_app_agent_profiles(&value)
}

pub fn save_app_agent_profiles(
    state: &AppState,
    profiles: Vec<AgentProfile>,
) -> Result<Vec<AgentProfile>, String> {
    let mut normalized = profiles
        .into_iter()
        .filter_map(normalize_saved_profile)
        .collect::<Vec<_>>();
    normalized.sort_by(|a, b| a.id.cmp(&b.id).then_with(|| a.label.cmp(&b.label)));
    normalized.dedup_by(|a, b| a.id == b.id);
    let value = serde_json::to_string(&normalized)
        .map_err(|err| format!("Failed to serialize agent profiles: {err}"))?;
    settings_repository::set_value(&state.db, APP_AGENT_PROFILES_KEY, &value)?;
    Ok(normalized)
}

pub fn resolve_agent_profile(
    state: &AppState,
    workspace_id: Option<&str>,
    profile_id: Option<&str>,
    legacy_profile: Option<&str>,
) -> Result<AgentProfile, String> {
    let requested = profile_id
        .filter(|value| !value.trim().is_empty())
        .or(legacy_profile)
        .unwrap_or("claude-default");
    let profiles = list_workspace_agent_profiles(state, workspace_id)?;
    if let Some(profile) = profiles.iter().find(|profile| profile.id == requested) {
        return Ok(profile.clone());
    }
    if let Some(profile) = profiles.iter().find(|profile| profile.agent == requested) {
        return Ok(profile.clone());
    }
    match requested {
        "codex" => Ok(default_profile("codex-default")),
        "claude_code" | "claude" => Ok(default_profile("claude-default")),
        "shell" => Ok(default_profile("shell")),
        other => Err(format!("Unsupported agent profile: {other}")),
    }
}

pub fn raw_to_profile(raw: RawAgentProfile) -> Option<AgentProfile> {
    let id = raw.id?.trim().to_string();
    if id.is_empty() {
        return None;
    }
    let agent = normalize_agent(raw.agent.as_deref().unwrap_or(&id));
    let provider = raw
        .provider
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let endpoint = raw
        .endpoint
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let local = raw.local.unwrap_or(false)
        || agent == "local_llm"
        || provider.as_deref().map(is_local_provider).unwrap_or(false)
        || endpoint.as_deref().map(is_local_endpoint).unwrap_or(false);
    let command = raw
        .command
        .unwrap_or_else(|| default_command_for_agent(&agent).to_string());
    Some(AgentProfile {
        label: raw.label.unwrap_or_else(|| id.clone()),
        id,
        agent,
        command,
        args: raw.args,
        model: raw.model,
        reasoning: raw.reasoning,
        mode: raw.mode,
        provider,
        endpoint,
        local,
        description: raw.description,
        skills: raw.skills,
        templates: raw.templates,
    })
}

fn parse_app_agent_profiles(value: &str) -> Result<Vec<AgentProfile>, String> {
    if value.trim().is_empty() {
        return Ok(vec![]);
    }
    if let Ok(profiles) = serde_json::from_str::<Vec<AgentProfile>>(value) {
        return Ok(profiles
            .into_iter()
            .filter_map(normalize_saved_profile)
            .collect());
    }
    let raw_profiles = serde_json::from_str::<Vec<RawAgentProfile>>(value)
        .map_err(|err| format!("Invalid saved agent profiles: {err}"))?;
    Ok(raw_profiles
        .into_iter()
        .filter_map(raw_to_profile)
        .collect())
}

fn normalize_saved_profile(mut profile: AgentProfile) -> Option<AgentProfile> {
    profile.id = profile.id.trim().to_string();
    if profile.id.is_empty() {
        return None;
    }
    profile.label = profile.label.trim().to_string();
    if profile.label.is_empty() {
        profile.label = profile.id.clone();
    }
    profile.agent = normalize_agent(&profile.agent);
    profile.command = profile.command.trim().to_string();
    if profile.command.is_empty() {
        profile.command = default_command_for_agent(&profile.agent).to_string();
    }
    profile.args = profile
        .args
        .into_iter()
        .map(|arg| arg.trim().to_string())
        .filter(|arg| !arg.is_empty())
        .collect();
    profile.model = trim_optional(profile.model);
    profile.reasoning = trim_optional(profile.reasoning);
    profile.mode = trim_optional(profile.mode);
    profile.provider = trim_optional(profile.provider);
    profile.endpoint = trim_optional(profile.endpoint);
    profile.description = trim_optional(profile.description);
    profile.local = profile.local
        || profile.agent == "local_llm"
        || profile
            .provider
            .as_deref()
            .map(is_local_provider)
            .unwrap_or(false)
        || profile
            .endpoint
            .as_deref()
            .map(is_local_endpoint)
            .unwrap_or(false);
    Some(profile)
}

fn trim_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn prompt_metadata_preamble(
    profile: &AgentProfile,
    task_mode: Option<&str>,
    reasoning: Option<&str>,
) -> String {
    let mut lines = vec![
        "Forge agent profile:".to_string(),
        format!("- Profile: {}", profile.label),
    ];
    if let Some(model) = profile.model.as_deref().filter(|value| !value.is_empty()) {
        lines.push(format!("- Model: {model}"));
    }
    if profile.local {
        lines.push("- Runtime: local".to_string());
    }
    if let Some(provider) = profile
        .provider
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        lines.push(format!("- Provider: {provider}"));
    }
    if let Some(endpoint) = profile
        .endpoint
        .as_deref()
        .filter(|value| !value.is_empty())
    {
        lines.push(format!("- Endpoint: {endpoint}"));
    }
    let mode = task_mode.or(profile.mode.as_deref()).unwrap_or("act");
    if !mode.eq_ignore_ascii_case("default") {
        lines.push(format!("- Mode: {mode}"));
    }
    let reasoning = reasoning
        .or(profile.reasoning.as_deref())
        .unwrap_or("default");
    if !reasoning.eq_ignore_ascii_case("default") {
        lines.push(format!("- Reasoning: {reasoning}"));
    }
    if !profile.skills.is_empty() {
        lines.push(format!("- Skills/templates: {}", profile.skills.join(", ")));
    }
    lines.push(match mode.to_ascii_lowercase().as_str() {
        "plan" => {
            "Instruction: plan first, be explicit about assumptions, and wait before risky changes."
                .to_string()
        }
        "review" => "Instruction: focus on review quality, risks, tests, and actionable findings."
            .to_string(),
        "fix" => "Instruction: make the smallest safe fix, then summarize validation.".to_string(),
        _ => "Instruction: act directly and keep the response focused on the task.".to_string(),
    });
    lines.join("\n")
}

pub fn prompt_metadata_preamble_for_workspace(
    state: &AppState,
    workspace_id: Option<&str>,
    profile: &AgentProfile,
    task_mode: Option<&str>,
    reasoning: Option<&str>,
) -> String {
    let mut preamble = prompt_metadata_preamble(profile, task_mode, reasoning);
    if let Some(workspace_id) = workspace_id {
        if let Ok(config) =
            workspace_script_service::get_workspace_forge_config(state, workspace_id)
        {
            let enabled_mcp = config
                .mcp_servers
                .iter()
                .filter(|server| server.enabled)
                .map(|server| {
                    let endpoint = server
                        .url
                        .as_deref()
                        .or(server.command.as_deref())
                        .unwrap_or("configured");
                    format!("{} ({}, {})", server.id, server.transport, endpoint)
                })
                .collect::<Vec<_>>();
            let disabled_mcp = config
                .mcp_servers
                .iter()
                .filter(|server| !server.enabled)
                .map(|server| format!("{} ({})", server.id, server.transport))
                .collect::<Vec<_>>();
            if !enabled_mcp.is_empty() || !disabled_mcp.is_empty() {
                preamble.push_str("\nForge workspace MCP config:");
                if !enabled_mcp.is_empty() {
                    preamble.push_str("\n- Enabled MCP servers: ");
                    preamble.push_str(&enabled_mcp.join(", "));
                }
                if !disabled_mcp.is_empty() {
                    preamble.push_str("\n- Disabled MCP servers: ");
                    preamble.push_str(&disabled_mcp.join(", "));
                }
                preamble.push_str("\n- Instruction: use MCP servers only when the active agent runtime has them configured; otherwise treat this as local config metadata.");
            }
        }
    }
    preamble
}

pub fn default_profiles() -> Vec<AgentProfile> {
    vec![
        AgentProfile {
            id: "claude-default".to_string(),
            label: "Claude".to_string(),
            agent: "claude_code".to_string(),
            command: "claude".to_string(),
            args: vec![],
            model: None,
            reasoning: None,
            mode: Some("act".to_string()),
            provider: None,
            endpoint: None,
            local: false,
            description: Some("Claude Code agent work".to_string()),
            skills: vec![],
            templates: vec![],
        },
        AgentProfile {
            id: "claude-plan".to_string(),
            label: "Claude Plan".to_string(),
            agent: "claude_code".to_string(),
            command: "claude".to_string(),
            args: vec![],
            model: None,
            reasoning: None,
            mode: Some("plan".to_string()),
            provider: None,
            endpoint: None,
            local: false,
            description: Some("Claude planning-oriented profile".to_string()),
            skills: vec![],
            templates: vec![],
        },
        AgentProfile {
            id: "codex-default".to_string(),
            label: "Codex".to_string(),
            agent: "codex".to_string(),
            command: "codex".to_string(),
            args: vec![],
            model: None,
            reasoning: Some("medium".to_string()),
            mode: Some("act".to_string()),
            provider: None,
            endpoint: None,
            local: false,
            description: Some("General Codex agent work".to_string()),
            skills: vec![],
            templates: vec![],
        },
        AgentProfile {
            id: "codex-high".to_string(),
            label: "Codex High".to_string(),
            agent: "codex".to_string(),
            command: "codex".to_string(),
            args: vec![],
            model: None,
            reasoning: Some("high".to_string()),
            mode: Some("act".to_string()),
            provider: None,
            endpoint: None,
            local: false,
            description: Some("Codex with high reasoning prompt context".to_string()),
            skills: vec![],
            templates: vec![],
        },
        AgentProfile {
            id: "shell".to_string(),
            label: "Shell".to_string(),
            agent: "shell".to_string(),
            command: std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string()),
            args: vec![],
            model: None,
            reasoning: None,
            mode: None,
            provider: None,
            endpoint: None,
            local: true,
            description: Some("Plain shell utility terminal".to_string()),
            skills: vec![],
            templates: vec![],
        },
    ]
}

fn default_profile(id: &str) -> AgentProfile {
    default_profiles()
        .into_iter()
        .find(|profile| profile.id == id)
        .unwrap()
}

fn normalize_agent(value: &str) -> String {
    match value {
        "claude" | "claude-code" | "claude_code" => "claude_code".to_string(),
        "shell" => "shell".to_string(),
        "local" | "local-llm" | "local_llm" | "ollama" | "llama.cpp" | "llama-cpp"
        | "llama_cpp" | "lmstudio" | "lm-studio" | "openai-compatible" | "openai_compatible" => {
            "local_llm".to_string()
        }
        _ => "codex".to_string(),
    }
}

fn default_command_for_agent(agent: &str) -> &'static str {
    match agent {
        "claude_code" => "claude",
        "local_llm" => "ollama",
        "shell" => "/bin/zsh",
        _ => "codex",
    }
}

fn is_local_provider(value: &str) -> bool {
    matches!(
        value.to_ascii_lowercase().as_str(),
        "ollama"
            | "llama.cpp"
            | "llama-cpp"
            | "llama_cpp"
            | "lmstudio"
            | "lm-studio"
            | "local"
            | "openai-compatible"
            | "openai_compatible"
    )
}

fn is_local_endpoint(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("localhost") || lower.contains("127.0.0.1") || lower.contains("[::1]")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_include_core_profiles() {
        let ids = default_profiles()
            .into_iter()
            .map(|profile| profile.id)
            .collect::<Vec<_>>();
        assert!(ids.contains(&"codex-default".to_string()));
        assert!(ids.contains(&"codex-high".to_string()));
        assert!(ids.contains(&"claude-plan".to_string()));
        assert!(ids.contains(&"shell".to_string()));
    }

    #[test]
    fn builds_prompt_metadata() {
        let profile = default_profile("codex-high");
        let preamble = prompt_metadata_preamble(&profile, Some("Review"), Some("High"));
        assert!(preamble.contains("Codex High"));
        assert!(preamble.contains("Mode: Review"));
        assert!(preamble.contains("Reasoning: High"));
    }

    #[test]
    fn local_profile_metadata_is_preserved_in_prompt_metadata() {
        let profile = AgentProfile {
            id: "qwen-local".to_string(),
            label: "Qwen Local".to_string(),
            agent: "local_llm".to_string(),
            command: "ollama".to_string(),
            args: vec!["run".to_string(), "qwen2.5-coder:14b".to_string()],
            model: Some("qwen2.5-coder:14b".to_string()),
            reasoning: None,
            mode: Some("act".to_string()),
            provider: Some("ollama".to_string()),
            endpoint: Some("http://localhost:11434".to_string()),
            local: true,
            description: None,
            skills: vec![],
            templates: vec![],
        };
        let preamble = prompt_metadata_preamble(&profile, None, None);
        assert!(profile.local);
        assert_eq!(profile.agent, "local_llm");
        assert!(preamble.contains("Runtime: local"));
        assert!(preamble.contains("Provider: ollama"));
        assert!(preamble.contains("Endpoint: http://localhost:11434"));
    }

    #[test]
    fn raw_local_profile_normalizes_without_becoming_codex() {
        let profile = raw_to_profile(RawAgentProfile {
            id: Some("local-review".to_string()),
            label: None,
            agent: Some("ollama".to_string()),
            command: None,
            args: vec!["run".to_string(), "qwen2.5-coder".to_string()],
            model: Some("qwen2.5-coder".to_string()),
            reasoning: None,
            mode: Some("review".to_string()),
            provider: Some("ollama".to_string()),
            endpoint: Some("http://127.0.0.1:11434".to_string()),
            local: None,
            description: None,
            skills: vec![],
            templates: vec![],
        })
        .expect("profile");

        assert_eq!(profile.agent, "local_llm");
        assert_eq!(profile.command, "ollama");
        assert!(profile.local);
    }

    #[test]
    fn parses_saved_app_profiles_with_local_metadata() {
        let saved = r#"[{"id":" local ","label":"","agent":"lmstudio","command":"","args":[" --model ",""],"provider":"lm-studio","endpoint":"http://localhost:1234/v1","local":false,"skills":[],"templates":[]}]"#;
        let profiles = parse_app_agent_profiles(saved).expect("profiles");
        assert_eq!(profiles.len(), 1);
        assert_eq!(profiles[0].id, "local");
        assert_eq!(profiles[0].label, "local");
        assert_eq!(profiles[0].agent, "local_llm");
        assert_eq!(profiles[0].command, "ollama");
        assert_eq!(profiles[0].args, vec!["--model"]);
        assert!(profiles[0].local);
    }
}
