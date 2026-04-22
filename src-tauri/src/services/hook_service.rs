use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::repositories::{activity_repository, workspace_repository};
use crate::services::{command_safety_service, workspace_script_service};
use crate::state::AppState;

#[derive(Debug, Clone, Copy)]
pub enum HookPhase {
    Pre,
    Post,
}

fn now_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn run_workspace_hooks(
    state: &AppState,
    workspace_id: &str,
    hook_kind: &str,
    phase: HookPhase,
    context: &Value,
) -> Result<(), String> {
    let config = workspace_script_service::get_workspace_forge_config(state, workspace_id)?;
    let commands = match hook_kind {
        "run" => match phase {
            HookPhase::Pre => config.hooks.pre_run,
            HookPhase::Post => config.hooks.post_run,
        },
        "tool" => match phase {
            HookPhase::Pre => config.hooks.pre_tool,
            HookPhase::Post => config.hooks.post_tool,
        },
        "ship" => match phase {
            HookPhase::Pre => config.hooks.pre_ship,
            HookPhase::Post => config.hooks.post_ship,
        },
        other => {
            return Err(format!("Unsupported hook kind: {other}"));
        }
    };

    if commands.is_empty() {
        return Ok(());
    }

    let root = workspace_script_service::workspace_root_path(state, workspace_id)?;
    let ctx_json = serde_json::to_string(context).unwrap_or_else(|_| "{}".to_string());
    let blocking = matches!(phase, HookPhase::Pre);

    let workspace = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found while executing hooks"))?;

    for (index, command) in commands.iter().enumerate() {
        let label = format!(
            "{}:{}:{}",
            hook_kind,
            if blocking { "pre" } else { "post" },
            index + 1
        );
        let started = now_secs();

        if command_safety_service::is_risky_command(command)
            && !workspace_script_service::risky_workspace_scripts_enabled(state)
        {
            let reason = format!(
                "Blocked hook {label}. Enable risky workspace scripts in Settings to run: {command}"
            );
            let _ = activity_repository::record(
                &state.db,
                workspace_id,
                &workspace.summary.repo,
                Some(&workspace.summary.branch),
                "Workspace hook blocked",
                if blocking { "warning" } else { "info" },
                Some(&reason),
            );
            if blocking {
                return Err(reason);
            }
            continue;
        }

        let output = std::process::Command::new("zsh")
            .args(["-lc", command])
            .current_dir(&root)
            .env("FORGE_HOOK_CONTEXT", &ctx_json)
            .output();

        let ended = now_secs();
        match output {
            Ok(output) => {
                let exit_code = output.status.code().unwrap_or(-1);
                let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
                let details = format!(
                    "hook={label} exit={exit_code} duration={}s{}",
                    ended.saturating_sub(started),
                    if stderr.is_empty() {
                        String::new()
                    } else {
                        format!(" stderr={stderr}")
                    }
                );
                let _ = activity_repository::record(
                    &state.db,
                    workspace_id,
                    &workspace.summary.repo,
                    Some(&workspace.summary.branch),
                    "Workspace hook finished",
                    if output.status.success() {
                        "info"
                    } else {
                        "warning"
                    },
                    Some(&details),
                );

                if blocking && !output.status.success() {
                    return Err(format!(
                        "Pre-hook `{label}` failed (exit {exit_code}). Fix the hook or remove it from .forge/config.json hooks.{hook_kind}."
                    ));
                }
            }
            Err(err) => {
                let details = format!("hook={label} failed to start: {err}");
                let _ = activity_repository::record(
                    &state.db,
                    workspace_id,
                    &workspace.summary.repo,
                    Some(&workspace.summary.branch),
                    "Workspace hook failed",
                    "warning",
                    Some(&details),
                );
                if blocking {
                    return Err(format!("Pre-hook `{label}` failed to start: {err}"));
                }
            }
        }
    }

    Ok(())
}
