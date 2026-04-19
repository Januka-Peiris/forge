use std::fs;
use std::path::{Path, PathBuf};

use crate::models::workspace_script::RawForgeWorkspaceConfig;
use crate::models::{
    CreateWorkspaceTerminalInput, ForgeMcpServerConfig, ForgeWorkspaceConfig, TerminalSession,
};
use crate::repositories::{
    activity_repository, settings_repository, terminal_repository, workspace_repository,
};
use crate::services::{agent_profile_service, command_safety_service, terminal_service};
use crate::state::AppState;

const CONFIG_RELATIVE_PATH: &str = ".forge/config.json";

pub fn get_workspace_forge_config(
    state: &AppState,
    workspace_id: &str,
) -> Result<ForgeWorkspaceConfig, String> {
    let root = workspace_root_path(state, workspace_id)?;
    Ok(load_config_from_root(&root))
}

pub fn run_workspace_setup(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<TerminalSession>, String> {
    let config = get_workspace_forge_config(state, workspace_id)?;
    if let Some(warning) = config.warning.as_deref() {
        insert_script_activity(
            state,
            workspace_id,
            "Forge config warning",
            "warning",
            warning,
        );
        return Ok(vec![]);
    }

    let mut sessions = Vec::new();
    for (index, command) in config.setup.iter().enumerate() {
        insert_script_activity(
            state,
            workspace_id,
            "Workspace setup started",
            "info",
            &format!("Setup {} · {command}", index + 1),
        );
        match start_command_terminal(
            state,
            workspace_id,
            "run",
            &setup_title(index, command),
            command,
        ) {
            Ok(session) => {
                sessions.push(session);
            }
            Err(err) => {
                insert_script_activity(
                    state,
                    workspace_id,
                    "Workspace setup failed to start",
                    "warning",
                    &format!("Setup {} · {err}", index + 1),
                );
                return Err(err);
            }
        }
    }
    Ok(sessions)
}

pub fn start_workspace_run_command(
    state: &AppState,
    workspace_id: &str,
    command_index: usize,
) -> Result<TerminalSession, String> {
    let config = get_workspace_forge_config(state, workspace_id)?;
    let command = config.run.get(command_index).ok_or_else(|| {
        format!(
            "Run command {} was not found in .forge/config.json",
            command_index + 1
        )
    })?;
    let title = run_title(command_index, command);
    insert_script_activity(
        state,
        workspace_id,
        "Run command started",
        "info",
        &format!("{title} · {command}"),
    );
    start_command_terminal(state, workspace_id, "run", &title, command)
}

pub fn restart_workspace_run_command(
    state: &AppState,
    workspace_id: &str,
    command_index: usize,
) -> Result<TerminalSession, String> {
    let config = get_workspace_forge_config(state, workspace_id)?;
    let command = config.run.get(command_index).ok_or_else(|| {
        format!(
            "Run command {} was not found in .forge/config.json",
            command_index + 1
        )
    })?;
    let title = run_title(command_index, command);

    for session in terminal_repository::list_visible_for_workspace(&state.db, workspace_id)? {
        if session.terminal_kind == "run" && session.title == title && session.status == "running" {
            let _ = terminal_service::stop_workspace_terminal_session_by_id(state, &session.id);
        }
    }

    insert_script_activity(
        state,
        workspace_id,
        "Run command restarted",
        "info",
        &format!("{title} · {command}"),
    );
    start_command_terminal(state, workspace_id, "run", &title, command)
}

pub fn stop_workspace_run_commands(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<TerminalSession>, String> {
    let mut stopped = Vec::new();
    for session in terminal_repository::list_visible_for_workspace(&state.db, workspace_id)? {
        if session.terminal_kind == "run" && session.status == "running" {
            stopped.push(terminal_service::stop_workspace_terminal_session_by_id(
                state,
                &session.id,
            )?);
        }
    }
    insert_script_activity(
        state,
        workspace_id,
        "Run commands stopped",
        "info",
        &format!("Stopped {} run terminal(s)", stopped.len()),
    );
    Ok(stopped)
}

pub fn start_command_terminal(
    state: &AppState,
    workspace_id: &str,
    kind: &str,
    title: &str,
    command: &str,
) -> Result<TerminalSession, String> {
    if command_safety_service::is_risky_command(command) && !risky_workspace_scripts_enabled(state)
    {
        let message = format!(
            "{title} was blocked because it looks destructive. Enable risky workspace scripts in Settings to run it."
        );
        insert_script_activity(
            state,
            workspace_id,
            "Workspace script blocked",
            "warning",
            &format!("{message} Command: {command}"),
        );
        return Err(message);
    }

    insert_script_activity(
        state,
        workspace_id,
        "Workspace script approved",
        if command_safety_service::is_risky_command(command) {
            "warning"
        } else {
            "info"
        },
        &format!("{title} · {command}"),
    );

    terminal_service::create_workspace_terminal(
        state,
        CreateWorkspaceTerminalInput {
            workspace_id: workspace_id.to_string(),
            kind: kind.to_string(),
            profile: "shell".to_string(),
            title: Some(title.to_string()),
            command: Some(command.to_string()),
            args: None,
            profile_id: Some("shell".to_string()),
            cols: None,
            rows: None,
        },
    )
}

pub fn load_config_from_root(root: &Path) -> ForgeWorkspaceConfig {
    let config_path = root.join(CONFIG_RELATIVE_PATH);
    if !config_path.exists() {
        return ForgeWorkspaceConfig::default();
    }

    let display_path = config_path.display().to_string();
    let text = match fs::read_to_string(&config_path) {
        Ok(text) => text,
        Err(err) => {
            return ForgeWorkspaceConfig {
                exists: true,
                path: Some(display_path),
                warning: Some(format!("Could not read .forge/config.json: {err}")),
                ..ForgeWorkspaceConfig::default()
            };
        }
    };

    match serde_json::from_str::<RawForgeWorkspaceConfig>(&text) {
        Ok(raw) => {
            let (mcp_servers, mcp_warnings) = parse_mcp_servers(raw.mcp_servers);
            ForgeWorkspaceConfig {
                exists: true,
                path: Some(display_path),
                setup: sanitize_commands(raw.setup),
                run: sanitize_commands(raw.run),
                teardown: sanitize_commands(raw.teardown),
                agent_profiles: raw
                    .agent_profiles
                    .into_iter()
                    .filter_map(agent_profile_service::raw_to_profile)
                    .collect(),
                mcp_servers,
                mcp_warnings,
                warning: None,
            }
        }
        Err(err) => ForgeWorkspaceConfig {
            exists: true,
            path: Some(display_path),
            warning: Some(format!("Invalid .forge/config.json: {err}")),
            ..ForgeWorkspaceConfig::default()
        },
    }
}

pub fn run_title(index: usize, command: &str) -> String {
    command_title("Run", index, command)
}

pub fn setup_title(index: usize, command: &str) -> String {
    command_title("Setup", index, command)
}

fn command_title(prefix: &str, index: usize, command: &str) -> String {
    let clean = command.split_whitespace().collect::<Vec<_>>().join(" ");
    let truncated = if clean.chars().count() > 42 {
        format!("{}…", clean.chars().take(41).collect::<String>())
    } else {
        clean
    };
    if truncated.is_empty() {
        format!("{prefix} {}", index + 1)
    } else if prefix == "Run" {
        truncated
    } else {
        format!("{prefix} {} · {truncated}", index + 1)
    }
}

fn sanitize_commands(commands: Vec<String>) -> Vec<String> {
    commands
        .into_iter()
        .map(|command| command.trim().to_string())
        .filter(|command| !command.is_empty())
        .collect()
}

fn parse_mcp_servers(value: serde_json::Value) -> (Vec<ForgeMcpServerConfig>, Vec<String>) {
    match value {
        serde_json::Value::Array(items) => collect_mcp_servers(
            items
                .into_iter()
                .enumerate()
                .map(|(index, item)| (format!("server-{}", index + 1), item)),
        ),
        serde_json::Value::Object(map) => collect_mcp_servers(map),
        serde_json::Value::Null => (vec![], vec![]),
        _ => (
            vec![],
            vec!["MCP config must be an object or array.".to_string()],
        ),
    }
}

fn collect_mcp_servers(
    items: impl IntoIterator<Item = (String, serde_json::Value)>,
) -> (Vec<ForgeMcpServerConfig>, Vec<String>) {
    let mut servers = Vec::new();
    let mut warnings = Vec::new();
    for (id_hint, value) in items {
        match mcp_from_value(id_hint.clone(), value) {
            Ok(server) => servers.push(server),
            Err(warning) => warnings.push(format!("{id_hint}: {warning}")),
        }
    }
    (servers, warnings)
}

fn mcp_from_value(
    id_hint: String,
    value: serde_json::Value,
) -> Result<ForgeMcpServerConfig, String> {
    let object = value
        .as_object()
        .ok_or_else(|| "MCP server entry must be an object.".to_string())?;
    let enabled = object
        .get("enabled")
        .and_then(serde_json::Value::as_bool)
        .unwrap_or(true);
    let id = object
        .get("id")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&id_hint)
        .to_string();
    let transport = object
        .get("transport")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| {
            if object.get("url").is_some() {
                "http"
            } else {
                "stdio"
            }
        })
        .to_string();
    let command = object
        .get("command")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let url = object
        .get("url")
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let args = object
        .get("args")
        .and_then(serde_json::Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(serde_json::Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();
    let env = object
        .get("env")
        .and_then(serde_json::Value::as_object)
        .map(|map| {
            map.iter()
                .filter_map(|(key, value)| {
                    value
                        .as_str()
                        .map(|_| (key.clone(), "<redacted>".to_string()))
                })
                .collect()
        })
        .unwrap_or_default();

    if enabled && command.is_none() && url.is_none() {
        return Err("enabled MCP server needs either command or url.".to_string());
    }

    Ok(ForgeMcpServerConfig {
        id,
        transport,
        command,
        args,
        env,
        url,
        enabled,
    })
}

fn risky_workspace_scripts_enabled(state: &AppState) -> bool {
    settings_repository::get_value(&state.db, "allow_risky_workspace_scripts")
        .ok()
        .flatten()
        .as_deref()
        == Some("true")
}

fn workspace_root_path(state: &AppState, workspace_id: &str) -> Result<PathBuf, String> {
    let workspace = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let path = workspace
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let path = PathBuf::from(path);
    if !path.exists() || !path.is_dir() {
        return Err(format!(
            "Workspace root path is unavailable: {}",
            path.display()
        ));
    }
    Ok(path)
}

fn insert_script_activity(
    state: &AppState,
    workspace_id: &str,
    event: &str,
    level: &str,
    details: &str,
) {
    let workspace = match workspace_repository::get_detail(&state.db, workspace_id) {
        Ok(Some(workspace)) => workspace,
        _ => return,
    };
    let _ = activity_repository::record(
        &state.db,
        workspace_id,
        &workspace.summary.repo,
        Some(&workspace.summary.branch),
        event,
        level,
        Some(details),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "forge-script-test-{name}-{}",
            terminal_service::timestamp()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("temp root");
        root
    }

    #[test]
    fn missing_config_returns_default() {
        let dir = temp_root("missing");
        let config = load_config_from_root(&dir);
        assert!(!config.exists);
        assert!(config.setup.is_empty());
        assert!(config.run.is_empty());
        assert!(config.warning.is_none());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn valid_config_parses_and_trims_commands() {
        let dir = temp_root("valid");
        fs::create_dir_all(dir.join(".forge")).expect("forge dir");
        fs::write(
            dir.join(CONFIG_RELATIVE_PATH),
            r#"{"setup":[" npm install ", ""],"run":["npm run dev"],"teardown":["kill-port 3000"],"mcpServers":{"linear":{"command":"npx","args":["-y","linear-mcp"],"env":{"LINEAR_API_KEY":"test"}}}}"#,
        )
        .expect("write config");

        let config = load_config_from_root(&dir);
        assert!(config.exists);
        assert_eq!(config.setup, vec!["npm install"]);
        assert_eq!(config.run, vec!["npm run dev"]);
        assert_eq!(config.teardown, vec!["kill-port 3000"]);
        assert_eq!(config.mcp_servers.len(), 1);
        assert_eq!(config.mcp_servers[0].id, "linear");
        assert_eq!(config.mcp_servers[0].command.as_deref(), Some("npx"));
        assert_eq!(config.mcp_servers[0].args, vec!["-y", "linear-mcp"]);
        assert_eq!(
            config.mcp_servers[0]
                .env
                .get("LINEAR_API_KEY")
                .map(String::as_str),
            Some("<redacted>")
        );
        assert!(config.mcp_warnings.is_empty());
        assert!(config.warning.is_none());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn invalid_mcp_config_is_non_blocking_warning() {
        let dir = temp_root("invalid-mcp");
        fs::create_dir_all(dir.join(".forge")).expect("forge dir");
        fs::write(
            dir.join(CONFIG_RELATIVE_PATH),
            r#"{"setup":["echo ok"],"mcpServers":{"broken":{"transport":"stdio"}}}"#,
        )
        .expect("write config");

        let config = load_config_from_root(&dir);
        assert!(config.exists);
        assert_eq!(config.setup, vec!["echo ok"]);
        assert!(config.warning.is_none());
        assert!(config.mcp_servers.is_empty());
        assert!(config.mcp_warnings[0].contains("needs either command or url"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn invalid_config_returns_readable_warning() {
        let dir = temp_root("invalid");
        fs::create_dir_all(dir.join(".forge")).expect("forge dir");
        fs::write(dir.join(CONFIG_RELATIVE_PATH), "{").expect("write config");

        let config = load_config_from_root(&dir);
        assert!(config.exists);
        assert!(config
            .warning
            .unwrap()
            .contains("Invalid .forge/config.json"));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn command_titles_are_safe_and_short() {
        assert_eq!(run_title(0, "npm run dev"), "npm run dev");
        assert_eq!(
            setup_title(1, " cp .env.example .env "),
            "Setup 2 · cp .env.example .env"
        );
        assert!(
            run_title(
                0,
                "a very long command with many arguments that should be shortened"
            )
            .len()
                <= 45
        );
    }
}
