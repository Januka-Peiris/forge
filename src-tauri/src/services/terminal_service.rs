use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use portable_pty::{native_pty_system, CommandBuilder, PtySize};

use crate::models::{
    AgentPromptEntry, AttachWorkspaceTerminalInput, CreateWorkspaceTerminalInput,
    QueueAgentPromptInput, StartTerminalSessionInput, TerminalOutputChunk, TerminalOutputEvent,
    TerminalOutputResponse, TerminalSession, TerminalSessionState,
};
use crate::repositories::{terminal_repository, workspace_repository};
use crate::services::{agent_context_service, agent_profile_service, tmux_service};
use crate::state::{ActiveTerminal, AppState};
use tauri::Emitter;

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
    let profile = TerminalProfile::from_agent_profile(&resolved_profile);
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
    let profile = TerminalProfile::from_agent_profile(&resolved_profile);
    let kind = normalize_terminal_kind(&input.kind, &profile.name);
    let session_role = if kind == "shell" || kind == "utility" || kind == "run" {
        "utility"
    } else {
        "agent"
    }
    .to_string();
    let display_order = terminal_repository::next_display_order(&state.db, &input.workspace_id)?;
    let session_id = format!("term-{}", unique_suffix());
    let tmux_name = tmux_service::sanitize_session_name(&format!(
        "forge-{}-{}",
        input.workspace_id, session_id
    ));
    let title = input
        .title
        .clone()
        .unwrap_or_else(|| default_terminal_title(&kind, &profile.name));
    let command_spec =
        TerminalCommandSpec::from_input(&profile, input.command.as_deref(), input.args.clone())?;

    tmux_service::create_session(&tmux_name, &cwd, &command_spec.command, &command_spec.args)?;

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
        backend: "tmux".to_string(),
        tmux_session_name: Some(tmux_name.clone()),
        title,
        terminal_kind: kind,
        display_order,
        is_visible: true,
        last_attached_at: None,
        last_captured_seq: 0,
    };
    terminal_repository::insert_session(&state.db, &session)?;
    append_log_line(
        state,
        &input.workspace_id,
        &session_id,
        "system",
        &format!("[forge] Started persistent tmux terminal {tmux_name}\r\n"),
    );
    attach_workspace_terminal_session(
        state,
        AttachWorkspaceTerminalInput {
            workspace_id: input.workspace_id,
            session_id: session_id.clone(),
            cols: input.cols,
            rows: input.rows,
        },
    )
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
    if active_for_session(state, &session.id)?.is_some() {
        return Ok(session);
    }
    if session.backend != "tmux" {
        return Err("Only tmux-backed terminals can be reattached by session id".to_string());
    }
    let tmux_name = session
        .tmux_session_name
        .clone()
        .ok_or_else(|| "Terminal is missing tmux session name".to_string())?;
    if !tmux_service::has_session(&tmux_name) {
        let ended_at = timestamp();
        terminal_repository::mark_finished(&state.db, &session.id, "interrupted", &ended_at, true)?;
        append_log_line(
            state,
            &session.workspace_id,
            &session.id,
            "system",
            "[forge] Persistent terminal ended; marked stale for recovery\r\n",
        );
        return Err(format!(
            "Persistent terminal {tmux_name} is no longer running"
        ));
    }

    if let Ok(snapshot) = tmux_service::capture_scrollback(&tmux_name) {
        if !snapshot.trim().is_empty() {
            append_log_line(
                state,
                &session.workspace_id,
                &session.id,
                "pty_snapshot",
                &snapshot,
            );
            let next = terminal_repository::next_seq(&state.db, &session.id).unwrap_or(0) as i64;
            let _ = terminal_repository::mark_captured(&state.db, &session.id, next);
        }
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
    let (attach_command, attach_args) = tmux_service::attach_args(&tmux_name)?;
    let mut command = CommandBuilder::new(attach_command);
    command.args(&attach_args);
    command.cwd(PathBuf::from(&session.cwd));
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|err| format!("Failed to attach tmux session {tmux_name}: {err}"))?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|err| format!("Failed to attach terminal reader: {err}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|err| format!("Failed to attach terminal writer: {err}"))?;
    let killer = child.clone_killer();
    let next_seq = Arc::new(AtomicU64::new(
        terminal_repository::next_seq(&state.db, &session.id).unwrap_or(0),
    ));
    let active = Arc::new(ActiveTerminal {
        session_id: session.id.clone(),
        writer: Mutex::new(writer),
        killer: Mutex::new(killer),
        master: Mutex::new(pair.master),
    });
    state
        .terminals
        .lock()
        .map_err(|_| "Terminal registry lock poisoned".to_string())?
        .insert(session.id.clone(), active);
    terminal_repository::mark_attached(&state.db, &session.id, &timestamp())?;
    append_log_line(
        state,
        &session.workspace_id,
        &session.id,
        "system",
        "[forge] Reattached to persistent terminal\r\n",
    );
    spawn_terminal_reader(
        state.app_handle.clone(),
        state.db.clone(),
        session.workspace_id.clone(),
        session.id.clone(),
        next_seq,
        reader,
    );
    spawn_terminal_monitor(
        state.clone(),
        session.workspace_id.clone(),
        session.session_role.clone(),
        session.id.clone(),
        child,
    );
    terminal_repository::get_session(&state.db, &session.id)?
        .ok_or_else(|| format!("Terminal session {} was not found", session.id))
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
    let active = active_for_session(state, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} is not attached"))?;
    let mut writer = active
        .writer
        .lock()
        .map_err(|_| "Terminal writer lock poisoned".to_string())?;
    writer
        .write_all(b"\x03")
        .map_err(|err| format!("Failed to interrupt terminal: {err}"))?;
    writer
        .flush()
        .map_err(|err| format!("Failed to flush interrupt: {err}"))?;
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
            let mut writer = active
                .writer
                .lock()
                .map_err(|_| "Terminal writer lock poisoned".to_string())?;
            writer
                .write_all(b"\x03")
                .map_err(|err| format!("Failed to interrupt terminal: {err}"))?;
            writer
                .flush()
                .map_err(|err| format!("Failed to flush interrupt: {err}"))?;
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
            reconcile_orphan_running_session(state, workspace_id, "agent", "interrupted")?;
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
    if session.backend == "tmux" {
        if let Some(name) = session.tmux_session_name.as_deref() {
            let _ = tmux_service::kill_session(name);
        }
    }
    detach_active_terminal(state, session_id);
    let ended_at = timestamp();
    terminal_repository::mark_finished(&state.db, session_id, "stopped", &ended_at, false)?;
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
    let sessions = terminal_repository::list_visible_for_workspace(&state.db, workspace_id)?;
    for session in &sessions {
        reconcile_tmux_session_state(state, session)?;
    }
    terminal_repository::list_visible_for_workspace(&state.db, workspace_id)
}

pub fn capture_workspace_terminal_scrollback(
    state: &AppState,
    session_id: &str,
) -> Result<TerminalOutputResponse, String> {
    let session = terminal_repository::get_session(&state.db, session_id)?
        .ok_or_else(|| format!("Terminal session {session_id} was not found"))?;
    if let Some(name) = session.tmux_session_name.as_deref() {
        let snapshot = tmux_service::capture_scrollback(name)?;
        append_log_line(
            state,
            &session.workspace_id,
            session_id,
            "pty_snapshot",
            &snapshot,
        );
    }
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
    let mut prompt = input.prompt.trim().to_string();
    if prompt.is_empty() {
        return Err("Prompt is required".to_string());
    }
    if let Ok(context) =
        agent_context_service::get_workspace_agent_context(state, &input.workspace_id)
    {
        if !context.prompt_preamble.trim().is_empty()
            && !prompt.contains("Forge linked repository context:")
        {
            prompt = format!("{}\n\nUser request:\n{}", context.prompt_preamble, prompt);
        }
    }
    let resolved_profile = agent_profile_service::resolve_agent_profile(
        state,
        Some(&input.workspace_id),
        input.profile_id.as_deref(),
        input.profile.as_deref(),
    )?;
    let metadata = agent_profile_service::prompt_metadata_preamble(
        &resolved_profile,
        input.task_mode.as_deref(),
        input.reasoning.as_deref(),
    );
    if !prompt.contains("Forge agent profile:") {
        prompt = format!("{metadata}\n\nUser request:\n{prompt}");
    }
    let profile = resolved_profile.id.clone();
    let mut entry = AgentPromptEntry {
        id: format!("prompt-{}", unique_suffix()),
        workspace_id: input.workspace_id.clone(),
        session_id: None,
        profile,
        prompt,
        status: "queued".to_string(),
        created_at: timestamp(),
        sent_at: None,
    };
    terminal_repository::insert_prompt_entry(&state.db, &entry)?;

    let mode = input.mode.unwrap_or_else(|| "send_now".to_string());
    if mode == "send_now" {
        dispatch_prompt_entry(state, &mut entry)?;
    }
    Ok(entry)
}

pub fn run_next_workspace_agent_prompt(
    state: &AppState,
    workspace_id: &str,
) -> Result<Option<AgentPromptEntry>, String> {
    let mut entry =
        match terminal_repository::latest_queued_prompt_for_workspace(&state.db, workspace_id)? {
            Some(entry) => entry,
            None => return Ok(None),
        };
    dispatch_prompt_entry(state, &mut entry)?;
    Ok(Some(entry))
}

pub fn list_workspace_agent_prompts(
    state: &AppState,
    workspace_id: &str,
    limit: Option<u32>,
) -> Result<Vec<AgentPromptEntry>, String> {
    terminal_repository::list_prompt_entries_for_workspace(&state.db, workspace_id, limit)
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

fn workspace_root_path(state: &AppState, workspace_id: &str) -> Result<PathBuf, String> {
    let workspace = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let cwd = workspace
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let path = PathBuf::from(cwd);
    if !path.exists() {
        return Err(format!(
            "Workspace root path does not exist: {}",
            path.display()
        ));
    }
    if !path.is_dir() {
        return Err(format!(
            "Workspace root path is not a directory: {}",
            path.display()
        ));
    }
    if !is_git_worktree(&path) {
        return Err(format!(
            "Workspace root path is not a Git worktree: {}",
            path.display()
        ));
    }
    Ok(path)
}

fn is_git_worktree(path: &Path) -> bool {
    std::process::Command::new("git")
        .arg("rev-parse")
        .arg("--is-inside-work-tree")
        .current_dir(path)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn active_for_workspace(
    state: &AppState,
    workspace_id: &str,
    session_role: &str,
) -> Result<Option<Arc<ActiveTerminal>>, String> {
    let Some(session) =
        terminal_repository::latest_for_workspace_role(&state.db, workspace_id, session_role)?
    else {
        return Ok(None);
    };
    active_for_session(state, &session.id)
}

fn active_for_session(
    state: &AppState,
    session_id: &str,
) -> Result<Option<Arc<ActiveTerminal>>, String> {
    let registry = state
        .terminals
        .lock()
        .map_err(|_| "Terminal registry lock poisoned".to_string())?;
    Ok(registry.get(session_id).cloned())
}

fn detach_active_terminal(state: &AppState, session_id: &str) {
    let active = state
        .terminals
        .lock()
        .ok()
        .and_then(|mut registry| registry.remove(session_id));
    if let Some(active) = active {
        if let Ok(mut killer) = active.killer.lock() {
            let _ = killer.kill();
        }
    }
}

/// If there is no in-memory PTY but the latest DB row for this role is still `running` (e.g. app
/// restarted or registry desynced), mark it finished so Stop/Interrupt actually update the UI.
fn reconcile_orphan_running_session(
    state: &AppState,
    workspace_id: &str,
    session_role: &str,
    status: &str,
) -> Result<(), String> {
    let Some(latest) =
        terminal_repository::latest_for_workspace_role(&state.db, workspace_id, session_role)?
    else {
        return Ok(());
    };
    if latest.status != "running" {
        return Ok(());
    }
    let ended_at = timestamp();
    log::info!(
        target: "forge_lib",
        "reconcile_orphan_running_session: session_id={} workspace_id={} role={} -> {}",
        latest.id,
        workspace_id,
        session_role,
        status
    );
    terminal_repository::mark_finished(&state.db, &latest.id, status, &ended_at, true)?;
    let seq = Arc::new(AtomicU64::new(
        terminal_repository::next_seq(&state.db, &latest.id).unwrap_or(0),
    ));
    append_output(
        Some(&state.app_handle),
        &state.db,
        workspace_id,
        &latest.id,
        &seq,
        "system",
        &format!("Terminal session {status} (reconciled; no active PTY)\r\n"),
    );
    let _ = terminal_repository::mark_prompt_status_by_session(&state.db, &latest.id, status);
    Ok(())
}

fn spawn_terminal_reader(
    app_handle: tauri::AppHandle,
    db: crate::db::Database,
    workspace_id: String,
    session_id: String,
    next_seq: Arc<AtomicU64>,
    mut reader: Box<dyn Read + Send>,
) {
    let (tx, rx) = mpsc::channel::<Result<Vec<u8>, String>>();
    thread::spawn(move || {
        let mut buffer = [0_u8; 8192];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    if tx.send(Ok(buffer[..n].to_vec())).is_err() {
                        break;
                    }
                }
                Err(err) => {
                    let _ = tx.send(Err(format!("\r\n[forge] terminal read failed: {err}\r\n")));
                    break;
                }
            }
        }
    });

    thread::spawn(move || {
        const MAX_BATCH_BYTES: usize = 16 * 1024;
        const MAX_BATCH_DELAY: Duration = Duration::from_millis(25);
        let mut pending = Vec::<u8>::new();

        let flush_pending = |pending: &mut Vec<u8>| {
            if pending.is_empty() {
                return;
            }
            let data = String::from_utf8_lossy(pending).to_string();
            pending.clear();
            append_output(
                Some(&app_handle),
                &db,
                &workspace_id,
                &session_id,
                &next_seq,
                "pty",
                &data,
            );
        };

        loop {
            match rx.recv_timeout(MAX_BATCH_DELAY) {
                Ok(Ok(bytes)) => {
                    pending.extend_from_slice(&bytes);
                    while pending.len() >= MAX_BATCH_BYTES {
                        let tail = pending.split_off(MAX_BATCH_BYTES);
                        flush_pending(&mut pending);
                        pending = tail;
                    }
                }
                Ok(Err(message)) => {
                    flush_pending(&mut pending);
                    append_output(
                        Some(&app_handle),
                        &db,
                        &workspace_id,
                        &session_id,
                        &next_seq,
                        "system",
                        &message,
                    );
                    break;
                }
                Err(mpsc::RecvTimeoutError::Timeout) => flush_pending(&mut pending),
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    flush_pending(&mut pending);
                    break;
                }
            }
        }
    });
}

fn spawn_terminal_monitor(
    state: AppState,
    workspace_id: String,
    _session_role: String,
    session_id: String,
    mut child: Box<dyn portable_pty::Child + Send>,
) {
    thread::spawn(move || {
        let wait_result = child.wait();
        let ended_at = timestamp();
        let session = terminal_repository::get_session(&state.db, &session_id)
            .ok()
            .flatten();
        let tmux_still_running = session
            .as_ref()
            .filter(|session| session.backend == "tmux")
            .and_then(|session| session.tmux_session_name.as_deref())
            .map(tmux_service::has_session)
            .unwrap_or(false);

        let was_active = state
            .terminals
            .lock()
            .map(|registry| registry.contains_key(&session_id))
            .unwrap_or(false);

        let _ = state.terminals.lock().map(|mut registry| {
            registry.remove(&session_id);
        });

        if tmux_still_running {
            append_log_line(
                &state,
                &workspace_id,
                &session_id,
                "system",
                "\r\n[forge] detached from persistent terminal; tmux session is still running\r\n",
            );
            return;
        }

        match wait_result {
            Ok(exit_status) => {
                let status = if was_active && exit_status.success() {
                    "succeeded"
                } else if was_active {
                    "failed"
                } else {
                    "stopped"
                };
                let _ = terminal_repository::mark_finished(
                    &state.db,
                    &session_id,
                    status,
                    &ended_at,
                    false,
                );
                append_log_line(
                    &state,
                    &workspace_id,
                    &session_id,
                    "system",
                    &format!("\r\n[forge] terminal exited: {exit_status:?}\r\n"),
                );
                let _ = terminal_repository::mark_prompt_status_by_session(
                    &state.db,
                    &session_id,
                    status,
                );
            }
            Err(err) => {
                let status = if was_active { "failed" } else { "stopped" };
                let _ = terminal_repository::mark_finished(
                    &state.db,
                    &session_id,
                    status,
                    &ended_at,
                    false,
                );
                append_log_line(
                    &state,
                    &workspace_id,
                    &session_id,
                    "system",
                    &format!("\r\n[forge] terminal wait failed: {err}\r\n"),
                );
                let _ = terminal_repository::mark_prompt_status_by_session(
                    &state.db,
                    &session_id,
                    status,
                );
            }
        }
    });
}

fn resolve_session_role(explicit: Option<&str>, profile: &str) -> String {
    match explicit.unwrap_or("").trim() {
        "agent" => "agent".to_string(),
        "utility" => "utility".to_string(),
        _ => {
            if profile == "shell" {
                "utility".to_string()
            } else {
                "agent".to_string()
            }
        }
    }
}

fn dispatch_prompt_entry(state: &AppState, entry: &mut AgentPromptEntry) -> Result<(), String> {
    let session = if let Some(active) = active_for_workspace(state, &entry.workspace_id, "agent")? {
        terminal_repository::get_session(&state.db, &active.session_id)?
            .ok_or_else(|| "Active agent session record was not found".to_string())?
    } else {
        start_workspace_terminal_session(
            state,
            StartTerminalSessionInput {
                workspace_id: entry.workspace_id.clone(),
                profile: entry.profile.clone(),
                session_role: Some("agent".to_string()),
                cols: None,
                rows: None,
                replace_existing: Some(false),
            },
        )?
    };

    let active = active_for_workspace(state, &entry.workspace_id, "agent")?
        .ok_or_else(|| "No active agent session found to send prompt".to_string())?;
    let mut writer = active
        .writer
        .lock()
        .map_err(|_| "Terminal writer lock poisoned".to_string())?;
    // Agent TUIs (claude, codex) run in raw terminal mode where Enter is \r (0x0D),
    // not \n (0x0A). Sending \r\n covers both raw-mode TUIs and cooked-mode shells.
    writer
        .write_all(format!("{}\r\n", entry.prompt).as_bytes())
        .map_err(|err| format!("Failed to write prompt to terminal: {err}"))?;
    writer
        .flush()
        .map_err(|err| format!("Failed to flush prompt to terminal: {err}"))?;

    let sent_at = timestamp();
    terminal_repository::mark_prompt_sent(&state.db, &entry.id, &session.id, &sent_at)?;
    entry.session_id = Some(session.id.clone());
    entry.status = "sent".to_string();
    entry.sent_at = Some(sent_at.clone());

    append_output(
        Some(&state.app_handle),
        &state.db,
        &entry.workspace_id,
        &session.id,
        &AtomicU64::new(terminal_repository::next_seq(&state.db, &session.id).unwrap_or(0)),
        "system",
        &format!("\r\n[forge] queued prompt sent at {sent_at}\r\n"),
    );
    Ok(())
}

fn append_log_line(
    state: &AppState,
    workspace_id: &str,
    session_id: &str,
    stream_type: &str,
    data: &str,
) {
    let next_seq =
        AtomicU64::new(terminal_repository::next_seq(&state.db, session_id).unwrap_or(0));
    append_output(
        Some(&state.app_handle),
        &state.db,
        workspace_id,
        session_id,
        &next_seq,
        stream_type,
        data,
    );
}

fn normalize_terminal_kind(kind: &str, profile: &str) -> String {
    match kind {
        "agent" | "shell" | "run" | "utility" => kind.to_string(),
        _ if profile == "shell" => "shell".to_string(),
        _ => "agent".to_string(),
    }
}

fn default_terminal_title(kind: &str, profile: &str) -> String {
    match (kind, profile) {
        ("shell", _) | ("utility", _) => "Shell".to_string(),
        (_, "claude_code") => "Claude".to_string(),
        (_, "codex") => "Codex".to_string(),
        ("run", _) => "Run".to_string(),
        _ => profile.to_string(),
    }
}

fn reconcile_tmux_session_state(state: &AppState, session: &TerminalSession) -> Result<(), String> {
    if session.backend != "tmux" || session.status != "running" {
        return Ok(());
    }
    let Some(name) = session.tmux_session_name.as_deref() else {
        return Ok(());
    };
    if !tmux_service::has_session(name) {
        let ended_at = timestamp();
        terminal_repository::mark_finished(&state.db, &session.id, "interrupted", &ended_at, true)?;
        append_log_line(
            state,
            &session.workspace_id,
            &session.id,
            "system",
            "[forge] Persistent terminal ended; marked stale for recovery\r\n",
        );
    }
    Ok(())
}

fn append_output(
    app_handle: Option<&tauri::AppHandle>,
    db: &crate::db::Database,
    workspace_id: &str,
    session_id: &str,
    next_seq: &AtomicU64,
    stream_type: &str,
    data: &str,
) {
    let seq = next_seq.fetch_add(1, Ordering::SeqCst);
    let chunk = TerminalOutputChunk {
        id: format!("term-out-{}-{seq}", unique_suffix()),
        session_id: session_id.to_string(),
        seq,
        timestamp: timestamp(),
        stream_type: stream_type.to_string(),
        data: data.to_string(),
    };
    let _ = terminal_repository::insert_output_chunk(db, &chunk);
    if let Some(app_handle) = app_handle {
        let _ = app_handle.emit(
            "forge://terminal-output",
            TerminalOutputEvent {
                workspace_id: workspace_id.to_string(),
                chunk,
            },
        );
    }
}

pub fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn unique_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{nanos}")
}

#[derive(Clone)]
struct TerminalProfile {
    name: String,
    command: String,
    args: Vec<String>,
}

#[derive(Clone)]
struct TerminalCommandSpec {
    command: String,
    args: Vec<String>,
}

impl TerminalCommandSpec {
    fn from_input(
        profile: &TerminalProfile,
        command: Option<&str>,
        args: Option<Vec<String>>,
    ) -> Result<Self, String> {
        if let Some(command) = command.map(str::trim).filter(|command| !command.is_empty()) {
            return Ok(Self {
                command: "/bin/zsh".to_string(),
                args: vec!["-lc".to_string(), command.to_string()],
            });
        }
        Ok(Self {
            command: profile.command.clone(),
            args: args.unwrap_or_else(|| profile.args.clone()),
        })
    }
}

impl TerminalProfile {
    fn from_agent_profile(profile: &crate::models::AgentProfile) -> Self {
        Self {
            name: profile.agent.clone(),
            command: profile.command.clone(),
            args: profile.args.clone(),
        }
    }
}
