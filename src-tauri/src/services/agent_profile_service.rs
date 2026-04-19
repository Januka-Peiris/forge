use std::collections::BTreeMap;

use crate::models::agent_profile::RawAgentProfile;
use crate::models::AgentProfile;
use crate::services::workspace_script_service;
use crate::state::AppState;

pub fn list_workspace_agent_profiles(
    state: &AppState,
    workspace_id: Option<&str>,
) -> Result<Vec<AgentProfile>, String> {
    let mut profiles = default_profiles()
        .into_iter()
        .map(|profile| (profile.id.clone(), profile))
        .collect::<BTreeMap<_, _>>();

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
        description: raw.description,
        skills: raw.skills,
        templates: raw.templates,
    })
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
            if !enabled_mcp.is_empty() {
                preamble.push_str("\nForge workspace MCP config:");
                preamble.push_str("\n- Available MCP servers: ");
                preamble.push_str(&enabled_mcp.join(", "));
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
        _ => "codex".to_string(),
    }
}

fn default_command_for_agent(agent: &str) -> &'static str {
    match agent {
        "claude_code" => "claude",
        "shell" => "/bin/zsh",
        _ => "codex",
    }
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
}
