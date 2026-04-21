use std::io::Write;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

use crate::models::{
    AgentPromptEntry, AttachWorkspaceTerminalInput, CommandApprovalEvent,
    CreateWorkspaceTerminalInput, QueueAgentPromptInput, StartTerminalSessionInput,
    TerminalOutputResponse, TerminalSession, TerminalSessionState,
};
use crate::repositories::settings_repository;
use crate::repositories::{activity_repository, terminal_repository};
use crate::services::{
    agent_profile_service, command_safety_service,
};
use crate::state::{ActiveTerminal, AppState};
use tauri::Emitter;

mod activity;
mod launch;
mod output;
mod prompts;
mod queue;
mod runtime;

use activity::{
    command_preview, record_blocked_terminal_launch_activity,
    record_terminal_lifecycle_activity, record_terminal_start_activity,
};
use launch::{
    default_terminal_title, normalize_terminal_kind, resolve_session_role, workspace_root_path,
    TerminalCommandSpec, TerminalProfile,
};
use output::{
    append_log_line, append_output, enriched_path as enriched_path_impl,
    unique_suffix as output_unique_suffix,
};
use queue::{
    batch_dispatch_workspace_agent_prompt as batch_dispatch_workspace_agent_prompt_impl,
    list_workspace_agent_prompts as list_workspace_agent_prompts_impl,
    queue_workspace_agent_prompt as queue_workspace_agent_prompt_impl,
    run_next_workspace_agent_prompt as run_next_workspace_agent_prompt_impl,
};
use runtime::{
    active_for_session, active_for_workspace, detach_active_terminal,
    reconcile_orphan_running_session, send_interrupt_to_session, spawn_terminal_monitor,
    spawn_terminal_reader,
};

fn agent_effective_model(
    state: &AppState,
    profile: &crate::models::AgentProfile,
) -> Option<String> {
    // Profile-level model overrides the global default.
    profile.model.clone().or_else(|| {
        settings_repository::get_value(&state.db, "agent_default_model")
            .ok()
            .flatten()
    })
}

pub fn start_workspace_terminal_session(
    state: &AppState,
    input: StartTerminalSessionInput,
) -> Result<TerminalSession, String> {
    let resolved_profile = agent_profile_service::resolve_agent_profile(
        state,
        Some(&input.workspace_id),
        Some(&input.profile),
        Some(&input.profile),
    )?;
    let effective_model = agent_effective_model(state, &resolved_profile);
    let profile =
        TerminalProfile::from_agent_profile(&resolved_profile, effective_model.as_deref());
    let session_role = resolve_session_role(input.session_role.as_deref(), &profile.name);
    if input.replace_existing.unwrap_or(false) {
        if let Some(existing) = terminal_repository::latest_for_workspace_role(
            &state.db,
            &input.workspace_id,
            &session_role,
        )? {
            let _ = stop_workspace_terminal_session_by_id(state, &existing.id);
        }
    }
    create_workspace_terminal(
        state,
        CreateWorkspaceTerminalInput {
            workspace_id: input.workspace_id,
            kind: session_role,
            profile: input.profile,
            title: None,
            command: None,
            profile_id: Some(resolved_profile.id.clone()),
            args: None,
            cols: input.cols,
            rows: input.rows,
        },
    )
}

pub fn create_workspace_terminal(
    state: &AppState,
    input: CreateWorkspaceTerminalInput,
) -> Result<TerminalSession, String> {
    let cwd = workspace_root_path(state, &input.workspace_id)?;
    let resolved_profile = agent_profile_service::resolve_agent_profile(
        state,
        Some(&input.workspace_id),
        input.profile_id.as_deref(),
        Some(&input.profile),
    )?;
    let effective_model = agent_effective_model(state, &resolved_profile);
    let profile =
        TerminalProfile::from_agent_profile(&resolved_profile, effective_model.as_deref());
    let kind = normalize_terminal_kind(&input.kind, &profile.name);
    let session_role = if kind == "shell" || kind == "utility" || kind == "run" {
        "utility"
    } else {
        "agent"
    }
    .to_string();
    let display_order = terminal_repository::next_display_order(&state.db, &input.workspace_id)?;
    let session_id = format!("term-{}", unique_suffix());
    let title = input
        .title
        .clone()
        .unwrap_or_else(|| default_terminal_title(&kind, &profile.name));
    let command_spec =
        TerminalCommandSpec::from_input(&profile, input.command.as_deref(), input.args.clone())?;
    let launch_command = command_spec.command.clone();
    let launch_args = command_spec.args.clone();
    let launch_preview = command_preview(&launch_command, &launch_args);
    if command_safety_service::is_risky_command(&launch_preview) {
        record_blocked_terminal_launch_activity(
            state,
            &input.workspace_id,
            &resolved_profile,
            &launch_preview,
        );
        return Err(format!(
            "Refusing to launch terminal profile {} because the command looks risky: {}",
            resolved_profile.label, launch_preview
        ));
    }

    let rows = input.rows.unwrap_or(30).max(5);
    let cols = input.cols.unwrap_or(100).max(20);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|err| format!("Failed to open PTY: {err}"))?;

    let mut command = CommandBuilder::new(&command_spec.command);
    command.args(&command_spec.args);
    command.cwd(&cwd);
    command.env("TERM", "xterm-256color");
    command.env("PATH", enriched_path());
    if std::env::var("SHELL").is_err() {
        command.env("SHELL", "/bin/zsh");
    }

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|err| format!("Failed to start terminal: {err}"))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|err| format!("Failed to get terminal reader: {err}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|err| format!("Failed to get terminal writer: {err}"))?;
    let killer = child.clone_killer();

    let started_at = timestamp();
    let session = TerminalSession {
        id: session_id.clone(),
        workspace_id: input.workspace_id.clone(),
        session_role,
        profile: resolved_profile.id.clone(),
        cwd: cwd.display().to_string(),
        status: "running".to_string(),
        started_at,
        ended_at: None,
        command: command_spec.command,
        args: command_spec.args,
        pid: None,
        stale: false,
        closed_at: None,
        backend: "pty".to_string(),
        title,
        terminal_kind: kind,
        display_order,
        is_visible: true,
        last_attached_at: None,
        last_captured_seq: 0,
    };
    terminal_repository::insert_session(&state.db, &session)?;
    record_terminal_start_activity(
        state,
        &session,
        &resolved_profile,
        &launch_command,
        &launch_args,
    );

    let next_seq = Arc::new(AtomicU64::new(0));
    let last_output_at_secs = Arc::new(AtomicU64::new(0));
    let active = Arc::new(ActiveTerminal {
        session_id: session.id.clone(),
        writer: Mutex::new(writer),
        killer: Mutex::new(killer),
        master: Mutex::new(pair.master),
        last_output_at_secs: last_output_at_secs.clone(),
    });
    state
        .terminals
        .lock()
        .map_err(|_| "Terminal registry lock poisoned".to_string())?
        .insert(session.id.clone(), active);

    spawn_terminal_reader(
        state.app_handle.clone(),
        state.db.clone(),
        input.workspace_id.clone(),
        session_id.clone(),
        next_seq,
        last_output_at_secs,
        reader,
    );
    spawn_terminal_monitor(
        state.clone(),
        input.workspace_id,
        session.session_role.clone(),
        session_id,
        child,
    );

    terminal_repository::get_session(&state.db, &session.id)?
        .ok_or_else(|| format!("Terminal session {} was not found", session.id))
}

pub fn attach_workspace_terminal_session(
    state: &AppState,
    input: AttachWorkspaceTerminalInput,
) -> Result<TerminalSession, String> {
    let session = terminal_repository::get_session(&state.db, &input.session_id)?
        .ok_or_else(|| format!("Terminal session {} was not found", input.session_id))?;
    if session.workspace_id != input.workspace_id {
        return Err(format!(
            "Terminal session {} does not belong to workspace {}",
            input.session_id, input.workspace_id
        ));
    }
    // Already connected — nothing to do.
    if active_for_session(state, &session.id)?.is_some() {
        return Ok(session);
    }
    // PTY sessions can't be reattached once the process exits.
    if session.status != "running" {
        return Err(format!(
            "Terminal session {} has already ended ({})",
            session.id, session.status
        ));
    }
    // Session is marked running in DB but has no active PTY — it's orphaned.
    let ended_at = timestamp();
    terminal_repository::mark_finished(&state.db, &session.id, "interrupted", &ended_at, true)?;
    append_log_line(
        state,
        &session.workspace_id,
        &session.id,
        "system",
        "[forge] Terminal process ended; start a new session\r\n",
    );
    Err(format!(
        "Terminal session {} is no longer running — start a new one",
        session.id
    ))
}

pub fn write_workspace_terminal_input(
    state: &AppState,
    workspace_id: &str,
    data: &str,
) -> Result<(), String> {
    let active = active_for_workspace(state, workspace_id, "agent")?
        .ok_or_else(|| "No active terminal session for this workspace".to_string())?;
    write_workspace_terminal_session_input(state, &active.session_id, data)
}

pub fn write_workspace_terminal_session_input(
    state: &AppState,
    session_id: &str,
    data: &str,
) -> Result<(), String> {
    // Gate dangerous commands on shell/utility sessions.
    // Agent sessions (claude, codex) manage their own shell — we don't intercept those.
    if let Ok(Some(session)) = terminal_repository::get_session(&state.db, session_id) {
        if matches!(session.terminal_kind.as_str(), "shell" | "utility") {
            let line = data.trim_end_matches(['\r', '\n']);
            if !line.is_empty() && command_safety_service::is_risky_command(line) {
                // Stash the data and ask the user before writing.
                state
                    .pending_commands
                    .lock()
                    .map_err(|_| "Pending command registry lock poisoned".to_string())?
                    .insert(session_id.to_string(), data.to_string());
                let _ = state.app_handle.emit(
                    "forge://command-approval-required",
                    CommandApprovalEvent {
                        session_id: session_id.to_string(),
                        workspace_id: session.workspace_id,
                        command: line.to_string(),
                    },
                );
                return Ok(());
            }
        }
    }
    pty_write_raw(state, session_id, data)
}

/// Called after the user approves or denies a gated command.
pub fn approve_workspace_terminal_command(
    state: &AppState,
    session_id: &str,
    approved: bool,
) -> Result<(), String> {
    let data = state
        .pending_commands
        .lock()
        .map_err(|_| "Pending command registry lock poisoned".to_string())?
        .remove(session_id)
        .ok_or_else(|| format!("No pending command for session {session_id}"))?;

    if let Ok(Some(session)) = terminal_repository::get_session(&state.db, session_id) {
        let line = data.trim_end_matches(['\r', '\n']);
        let event = if approved {
            "Command approved"
        } else {
            "Command denied"
        };
        let _ = activity_repository::record(
            &state.db,
            &session.workspace_id,
            "",
            None,
            event,
            if approved { "warning" } else { "info" },
            Some(line),
        );
    }

    if approved {
        pty_write_raw(state, session_id, &data)
    } else {
        // Send Ctrl-C to cancel whatever the shell was about to execute.
        pty_write_raw(state, session_id, "\x03")
    }
}

/// Writes bytes directly to the PTY without any safety check.
fn pty_write_raw(state: &AppState, session_id: &str, data: &str) -> Result<(), String> {
    let active = active_for_session(state, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} is not attached"))?;
    let mut writer = active
        .writer
        .lock()
        .map_err(|_| "Terminal writer lock poisoned".to_string())?;
    writer
        .write_all(data.as_bytes())
        .map_err(|err| format!("Failed to write to terminal: {err}"))?;
    writer
        .flush()
        .map_err(|err| format!("Failed to flush terminal input: {err}"))?;
    Ok(())
}

pub fn interrupt_workspace_terminal_session_by_id(
    state: &AppState,
    session_id: &str,
) -> Result<TerminalSession, String> {
    let session = terminal_repository::get_session(&state.db, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} was not found"))?;
    send_interrupt_to_session(state, &session)?;
    append_log_line(
        state,
        &session.workspace_id,
        session_id,
        "system",
        "\r\n[forge] interrupt sent (Ctrl-C)\r\n",
    );
    terminal_repository::get_session(&state.db, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} was not found"))
}

pub fn resize_workspace_terminal(
    state: &AppState,
    workspace_id: &str,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let active = active_for_workspace(state, workspace_id, "agent")?
        .ok_or_else(|| "No active terminal session for this workspace".to_string())?;
    resize_workspace_terminal_session(state, &active.session_id, cols, rows)
}

pub fn resize_workspace_terminal_session(
    state: &AppState,
    session_id: &str,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let active = active_for_session(state, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} is not attached"))?;
    let master = active
        .master
        .lock()
        .map_err(|_| "Terminal PTY lock poisoned".to_string())?;
    master
        .resize(PtySize {
            rows: rows.max(5),
            cols: cols.max(20),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|err| format!("Failed to resize terminal: {err}"))
}

pub fn stop_workspace_terminal_session(
    state: &AppState,
    workspace_id: &str,
) -> Result<TerminalSessionState, String> {
    log::info!(target: "forge_lib", "stop_workspace_terminal_session: agent workspace_id={workspace_id}");
    if let Some(session) =
        terminal_repository::latest_for_workspace_role(&state.db, workspace_id, "agent")?
    {
        stop_workspace_terminal_session_by_id(state, &session.id)?;
    }
    reconcile_orphan_running_session(state, workspace_id, "agent", "stopped")?;
    let out = get_workspace_terminal_session_state(state, workspace_id)?;
    log::info!(
        target: "forge_lib",
        "stop_workspace_terminal_session: done workspace_id={workspace_id} active_session={}",
        out.active_session.as_ref().map(|s| s.id.as_str()).unwrap_or("-")
    );
    Ok(out)
}

pub fn interrupt_workspace_terminal_session(
    state: &AppState,
    workspace_id: &str,
) -> Result<TerminalSessionState, String> {
    match active_for_workspace(state, workspace_id, "agent")? {
        Some(active) => {
            let session = terminal_repository::get_session(&state.db, &active.session_id)?
                .ok_or_else(|| "Active terminal session record was not found".to_string())?;
            send_interrupt_to_session(state, &session)?;
            record_terminal_lifecycle_activity(state, &session, "Terminal session interrupted");
            let seq = Arc::new(AtomicU64::new(
                terminal_repository::next_seq(&state.db, &active.session_id).unwrap_or(0),
            ));
            append_output(
                Some(&state.app_handle),
                &state.db,
                workspace_id,
                &active.session_id,
                &seq,
                "system",
                "\r\n[forge] interrupt sent (Ctrl-C)\r\n",
            );
        }
        None => {
            if let Some(session) =
                terminal_repository::latest_for_workspace_role(&state.db, workspace_id, "agent")?
            {
                if session.status == "running" {
                    send_interrupt_to_session(state, &session)?;
                    record_terminal_lifecycle_activity(
                        state,
                        &session,
                        "Terminal session interrupted",
                    );
                    append_log_line(
                        state,
                        workspace_id,
                        &session.id,
                        "system",
                        "\r\n[forge] interrupt sent to persistent tmux session (Ctrl-C)\r\n",
                    );
                }
            } else {
                reconcile_orphan_running_session(state, workspace_id, "agent", "interrupted")?;
            }
        }
    }
    get_workspace_terminal_session_state(state, workspace_id)
}

pub fn close_workspace_terminal_session(
    state: &AppState,
    workspace_id: &str,
) -> Result<TerminalSessionState, String> {
    if let Some(session) =
        terminal_repository::latest_for_workspace_role(&state.db, workspace_id, "agent")?
    {
        close_workspace_terminal_session_by_id(state, &session.id)?;
    }
    get_workspace_terminal_session_state(state, workspace_id)
}

pub fn stop_workspace_terminal_session_by_id(
    state: &AppState,
    session_id: &str,
) -> Result<TerminalSession, String> {
    let session = terminal_repository::get_session(&state.db, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} was not found"))?;
    detach_active_terminal(state, session_id);
    let ended_at = timestamp();
    terminal_repository::mark_finished(&state.db, session_id, "stopped", &ended_at, false)?;
    record_terminal_lifecycle_activity(state, &session, "Terminal session stopped");
    append_log_line(
        state,
        &session.workspace_id,
        session_id,
        "system",
        "[forge] Terminal session stopped\r\n",
    );
    terminal_repository::get_session(&state.db, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} was not found"))
}

pub fn close_workspace_terminal_session_by_id(
    state: &AppState,
    session_id: &str,
) -> Result<TerminalSession, String> {
    let session = terminal_repository::get_session(&state.db, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} was not found"))?;
    if session.status == "running" {
        stop_workspace_terminal_session_by_id(state, session_id)?;
    }
    let closed_at = timestamp();
    terminal_repository::mark_closed(&state.db, session_id, &closed_at)?;
    record_terminal_lifecycle_activity(state, &session, "Terminal session closed");
    append_log_line(
        state,
        &session.workspace_id,
        session_id,
        "system",
        "[forge] Session closed in workspace view; history retained\r\n",
    );
    terminal_repository::get_session(&state.db, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} was not found"))
}

pub fn list_workspace_visible_terminal_sessions(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<TerminalSession>, String> {
    terminal_repository::list_visible_for_workspace(&state.db, workspace_id)
}

pub fn capture_workspace_terminal_scrollback(
    state: &AppState,
    session_id: &str,
) -> Result<TerminalOutputResponse, String> {
    let session = terminal_repository::get_session(&state.db, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} was not found"))?;
    get_workspace_terminal_output_for_session(state, &session.workspace_id, session_id, Some(0))
}

pub fn get_workspace_terminal_session_state(
    state: &AppState,
    workspace_id: &str,
) -> Result<TerminalSessionState, String> {
    let active_session = match active_for_workspace(state, workspace_id, "agent")? {
        Some(active) => terminal_repository::get_session(&state.db, &active.session_id)?,
        None => None,
    };
    let latest_session =
        terminal_repository::latest_for_workspace_role(&state.db, workspace_id, "agent")?;

    Ok(TerminalSessionState {
        active_session,
        latest_session,
    })
}

pub fn get_workspace_terminal_output(
    state: &AppState,
    workspace_id: &str,
    since_seq: Option<u64>,
) -> Result<TerminalOutputResponse, String> {
    let session = match active_for_workspace(state, workspace_id, "agent")? {
        Some(active) => terminal_repository::get_session(&state.db, &active.session_id)?,
        None => terminal_repository::latest_for_workspace_role(&state.db, workspace_id, "agent")?,
    };

    let Some(session) = session else {
        return Ok(TerminalOutputResponse {
            session: None,
            chunks: vec![],
            next_seq: 0,
        });
    };

    let chunks =
        terminal_repository::list_output_chunks(&state.db, &session.id, since_seq.unwrap_or(0))?;
    let next_seq = terminal_repository::next_seq(&state.db, &session.id).unwrap_or(0);

    Ok(TerminalOutputResponse {
        session: Some(session),
        chunks,
        next_seq,
    })
}

pub fn get_workspace_terminal_output_for_session(
    state: &AppState,
    workspace_id: &str,
    session_id: &str,
    since_seq: Option<u64>,
) -> Result<TerminalOutputResponse, String> {
    let _ = workspace_root_path(state, workspace_id)?;
    let session = terminal_repository::get_session(&state.db, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} was not found"))?;
    if session.workspace_id != workspace_id {
        return Err(format!(
            "Terminal session {session_id} does not belong to workspace {workspace_id}"
        ));
    }

    let chunks =
        terminal_repository::list_output_chunks(&state.db, &session.id, since_seq.unwrap_or(0))?;
    let next_seq = terminal_repository::next_seq(&state.db, &session.id).unwrap_or(0);

    Ok(TerminalOutputResponse {
        session: Some(session),
        chunks,
        next_seq,
    })
}

pub fn list_workspace_terminal_sessions(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<TerminalSession>, String> {
    terminal_repository::list_for_workspace(&state.db, workspace_id)
}

pub fn reconnect_workspace_terminal_session(
    state: &AppState,
    workspace_id: &str,
    session_id: Option<&str>,
) -> Result<TerminalSessionState, String> {
    let _ = workspace_root_path(state, workspace_id)?;
    if let Some(session_id) = session_id {
        let active = active_for_workspace(state, workspace_id, "agent")?;
        if let Some(active) = active {
            if active.session_id != session_id {
                return Err(format!(
                    "Active terminal session mismatch. Requested {session_id}, active {}",
                    active.session_id
                ));
            }
        } else {
            let latest = terminal_repository::latest_for_workspace_role(
                &state.db,
                workspace_id,
                "agent",
            )?
            .ok_or_else(|| format!("No terminal session found for workspace {workspace_id}"))?;
            if latest.id != session_id {
                return Err(format!(
                    "Session {session_id} is not the latest known session for workspace {workspace_id}"
                ));
            }
        }
    }
    get_workspace_terminal_session_state(state, workspace_id)
}

pub fn queue_workspace_agent_prompt(
    state: &AppState,
    input: QueueAgentPromptInput,
) -> Result<AgentPromptEntry, String> {
    queue_workspace_agent_prompt_impl(state, input)
}

pub fn batch_dispatch_workspace_agent_prompt(
    state: &AppState,
    input: crate::models::BatchDispatchPromptInput,
) -> Result<Vec<AgentPromptEntry>, String> {
    batch_dispatch_workspace_agent_prompt_impl(state, input)
}

pub fn run_next_workspace_agent_prompt(
    state: &AppState,
    workspace_id: &str,
) -> Result<Option<AgentPromptEntry>, String> {
    run_next_workspace_agent_prompt_impl(state, workspace_id)
}

pub fn list_workspace_agent_prompts(
    state: &AppState,
    workspace_id: &str,
    limit: Option<u32>,
) -> Result<Vec<AgentPromptEntry>, String> {
    list_workspace_agent_prompts_impl(state, workspace_id, limit)
}

pub fn write_workspace_utility_terminal_input(
    state: &AppState,
    workspace_id: &str,
    data: &str,
) -> Result<(), String> {
    let active = active_for_workspace(state, workspace_id, "utility")?
        .ok_or_else(|| "No active utility terminal session for this workspace".to_string())?;
    write_workspace_terminal_session_input(state, &active.session_id, data)
}

pub fn resize_workspace_utility_terminal(
    state: &AppState,
    workspace_id: &str,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let active = active_for_workspace(state, workspace_id, "utility")?
        .ok_or_else(|| "No active utility terminal session for this workspace".to_string())?;
    resize_workspace_terminal_session(state, &active.session_id, cols, rows)
}

pub fn stop_workspace_utility_terminal_session(
    state: &AppState,
    workspace_id: &str,
) -> Result<TerminalSessionState, String> {
    log::info!(target: "forge_lib", "stop_workspace_utility_terminal_session: workspace_id={workspace_id}");
    if let Some(session) =
        terminal_repository::latest_for_workspace_role(&state.db, workspace_id, "utility")?
    {
        stop_workspace_terminal_session_by_id(state, &session.id)?;
    }
    reconcile_orphan_running_session(state, workspace_id, "utility", "stopped")?;
    let out = get_workspace_utility_terminal_session_state(state, workspace_id)?;
    log::info!(
        target: "forge_lib",
        "stop_workspace_utility_terminal_session: done workspace_id={workspace_id} active_session={}",
        out.active_session.as_ref().map(|s| s.id.as_str()).unwrap_or("-")
    );
    Ok(out)
}

pub fn get_workspace_utility_terminal_session_state(
    state: &AppState,
    workspace_id: &str,
) -> Result<TerminalSessionState, String> {
    let active_session = match active_for_workspace(state, workspace_id, "utility")? {
        Some(active) => terminal_repository::get_session(&state.db, &active.session_id)?,
        None => None,
    };
    let latest_session =
        terminal_repository::latest_for_workspace_role(&state.db, workspace_id, "utility")?;

    Ok(TerminalSessionState {
        active_session,
        latest_session,
    })
}

pub fn get_workspace_utility_terminal_output(
    state: &AppState,
    workspace_id: &str,
    since_seq: Option<u64>,
) -> Result<TerminalOutputResponse, String> {
    let session = match active_for_workspace(state, workspace_id, "utility")? {
        Some(active) => terminal_repository::get_session(&state.db, &active.session_id)?,
        None => terminal_repository::latest_for_workspace_role(&state.db, workspace_id, "utility")?,
    };

    let Some(session) = session else {
        return Ok(TerminalOutputResponse {
            session: None,
            chunks: vec![],
            next_seq: 0,
        });
    };

    let chunks =
        terminal_repository::list_output_chunks(&state.db, &session.id, since_seq.unwrap_or(0))?;
    let next_seq = chunks
        .last()
        .map(|chunk| chunk.seq.saturating_add(1))
        .unwrap_or_else(|| terminal_repository::next_seq(&state.db, &session.id).unwrap_or(0));

    Ok(TerminalOutputResponse {
        session: Some(session),
        chunks,
        next_seq,
    })
}

pub fn reconnect_workspace_utility_terminal_session(
    state: &AppState,
    workspace_id: &str,
    session_id: Option<&str>,
) -> Result<TerminalSessionState, String> {
    let _ = workspace_root_path(state, workspace_id)?;
    if let Some(session_id) = session_id {
        let active = active_for_workspace(state, workspace_id, "utility")?;
        if let Some(active) = active {
            if active.session_id != session_id {
                return Err(format!(
                    "Active utility terminal session mismatch. Requested {session_id}, active {}",
                    active.session_id
                ));
            }
        } else {
            let latest =
                terminal_repository::latest_for_workspace_role(&state.db, workspace_id, "utility")?
                    .ok_or_else(|| {
                        format!("No utility terminal session found for workspace {workspace_id}")
                    })?;
            if latest.id != session_id {
                return Err(format!(
                    "Session {session_id} is not the latest known utility session for workspace {workspace_id}"
                ));
            }
        }
    }
    get_workspace_utility_terminal_session_state(state, workspace_id)
}

pub fn timestamp() -> String {
    output::timestamp()
}

/// Build a PATH that includes common macOS binary locations.
/// When Tauri launches from Finder the inherited PATH is minimal.
pub fn enriched_path() -> String {
    enriched_path_impl()
}

fn unique_suffix() -> String {
    output_unique_suffix()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::AgentProfile;

    #[test]
    fn formats_terminal_lifecycle_activity_details() {
        let details = activity::format_terminal_lifecycle_activity_details(&TerminalSession {
            id: "term-123".to_string(),
            workspace_id: "ws-123".to_string(),
            session_role: "agent".to_string(),
            profile: "codex".to_string(),
            cwd: "/tmp/forge-workspace".to_string(),
            status: "running".to_string(),
            started_at: "now".to_string(),
            ended_at: None,
            command: "codex".to_string(),
            args: vec![],
            pid: Some(42),
            stale: false,
            closed_at: None,
            backend: "pty".to_string(),
            title: "Codex".to_string(),
            terminal_kind: "agent".to_string(),
            display_order: 0,
            is_visible: true,
            last_attached_at: None,
            last_captured_seq: 0,
        });

        assert!(details.contains("term-123"));
        assert!(details.contains("role: agent"));
        assert!(details.contains("profile: codex"));
        assert!(details.contains("pid: 42"));
        assert!(details.contains("/tmp/forge-workspace"));
    }

    #[test]
    fn formats_ollama_multiline_prompt_as_single_repl_message() {
        let session = TerminalSession {
            id: "term-local".to_string(),
            workspace_id: "ws-123".to_string(),
            session_role: "agent".to_string(),
            profile: "qwen-local".to_string(),
            cwd: "/tmp/forge-workspace".to_string(),
            status: "running".to_string(),
            started_at: "now".to_string(),
            ended_at: None,
            command: "/usr/local/bin/ollama".to_string(),
            args: vec!["run".to_string(), "qwen2.5-coder:7b".to_string()],
            pid: None,
            stale: false,
            closed_at: None,
            backend: "pty".to_string(),
            title: "Ollama qwen".to_string(),
            terminal_kind: "agent".to_string(),
            display_order: 0,
            is_visible: true,
            last_attached_at: None,
            last_captured_seq: 0,
        };
        let payload = prompts::terminal_prompt_payload_for_session(&session, "line one\nline two");
        assert_eq!(payload, "\"\"\"\nline one\nline two\n\"\"\"\r\n");
    }

    #[test]
    fn formats_local_terminal_start_activity_details() {
        let session = TerminalSession {
            id: "term-local".to_string(),
            workspace_id: "ws-123".to_string(),
            session_role: "agent".to_string(),
            profile: "ollama-local".to_string(),
            cwd: "/tmp/forge-workspace".to_string(),
            status: "running".to_string(),
            started_at: "now".to_string(),
            ended_at: None,
            command: "ollama".to_string(),
            args: vec!["run".to_string(), "qwen coder".to_string()],
            pid: None,
            stale: false,
            closed_at: None,
            backend: "pty".to_string(),
            title: "Ollama Local".to_string(),
            terminal_kind: "agent".to_string(),
            display_order: 0,
            is_visible: true,
            last_attached_at: None,
            last_captured_seq: 0,
        };
        let profile = AgentProfile {
            id: "ollama-local".to_string(),
            label: "Ollama Local".to_string(),
            agent: "local_llm".to_string(),
            command: "ollama".to_string(),
            args: vec!["run".to_string(), "qwen coder".to_string()],
            model: Some("qwen coder".to_string()),
            reasoning: None,
            mode: Some("act".to_string()),
            provider: Some("ollama".to_string()),
            endpoint: Some("http://localhost:11434".to_string()),
            local: true,
            description: None,
            skills: vec![],
            templates: vec![],
        };

        let details = activity::format_terminal_start_activity_details(
            &session,
            &profile,
            "ollama",
            &["run".to_string(), "qwen coder".to_string()],
        );

        assert!(details.contains("runtime: local"));
        assert!(details.contains("provider: ollama"));
        assert!(details.contains("model: qwen coder"));
        assert!(details.contains("endpoint: http://localhost:11434"));
        assert!(details.contains("ollama run 'qwen coder'"));
    }

    #[test]
    fn formats_blocked_terminal_launch_details() {
        let profile = AgentProfile {
            id: "risky-local".to_string(),
            label: "Risky Local".to_string(),
            agent: "local_llm".to_string(),
            command: "rm".to_string(),
            args: vec!["-rf".to_string(), "/tmp/example".to_string()],
            model: None,
            reasoning: None,
            mode: Some("act".to_string()),
            provider: Some("custom".to_string()),
            endpoint: None,
            local: true,
            description: None,
            skills: vec![],
            templates: vec![],
        };

        let details =
            activity::format_blocked_terminal_launch_details(&profile, "rm -rf /tmp/example");
        assert!(details.contains("Risky Local"));
        assert!(details.contains("runtime: local"));
        assert!(details.contains("provider: custom"));
        assert!(details.contains("risky-command patterns"));
    }
}
