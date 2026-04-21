use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::Emitter;

use crate::models::{StartTerminalSessionInput, TerminalSession};
use crate::repositories::{terminal_repository, workspace_repository};
use crate::services::{cost_parser, terminal_service};
use crate::state::{ActiveTerminal, AppState};

use super::output::{append_log_line, append_output};

pub(super) fn active_for_workspace(
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

pub(super) fn active_for_session(
    state: &AppState,
    session_id: &str,
) -> Result<Option<Arc<ActiveTerminal>>, String> {
    let registry = state
        .terminals
        .lock()
        .map_err(|_| "Terminal registry lock poisoned".to_string())?;
    Ok(registry.get(session_id).cloned())
}

pub(super) fn detach_active_terminal(state: &AppState, session_id: &str) {
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

pub(super) fn send_interrupt_to_session(
    state: &AppState,
    session: &TerminalSession,
) -> Result<(), String> {
    if let Some(active) = active_for_session(state, &session.id)? {
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
        return Ok(());
    }

    Err(format!("Terminal session {} is not attached", session.id))
}

pub(super) fn reconcile_orphan_running_session(
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
    let ended_at = terminal_service::timestamp();
    log::info!(
        target: "forge_lib",
        "reconcile_orphan_running_session: session_id={} workspace_id={} role={} -> {} (no active PTY)",
        latest.id,
        workspace_id,
        session_role,
        status,
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

pub(super) fn spawn_terminal_reader(
    app_handle: tauri::AppHandle,
    db: crate::db::Database,
    workspace_id: String,
    session_id: String,
    next_seq: Arc<AtomicU64>,
    last_output_at_secs: Arc<AtomicU64>,
    mut reader: Box<dyn Read + Send>,
) {
    let (tx, rx) = mpsc::sync_channel::<Result<Vec<u8>, String>>(128);
    thread::spawn(move || {
        let mut buffer = [0_u8; 4096];
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
        const MAX_BATCH_DELAY: Duration = Duration::from_millis(50);
        const MAX_PENDING_BYTES: usize = 256 * 1024;
        let mut pending = Vec::<u8>::with_capacity(MAX_BATCH_BYTES);

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
                    let now_secs = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();
                    last_output_at_secs.store(now_secs, Ordering::Relaxed);

                    let text = String::from_utf8_lossy(&bytes);
                    if let Some((tokens, cost)) = cost_parser::parse_cost(&text) {
                        let _ = workspace_repository::update_agent_session_cost(
                            &db,
                            &workspace_id,
                            tokens,
                            &cost,
                        );
                        if let Ok(ws) = workspace_repository::get(&db, &workspace_id) {
                            if let Some(limit) = ws.cost_limit_usd {
                                if let Ok(cost_float) = cost.trim_start_matches('$').parse::<f64>()
                                {
                                    if cost_float >= limit {
                                        let _ = app_handle.emit(
                                            "forge://workspace-budget-exceeded",
                                            serde_json::json!({
                                                "workspaceId": workspace_id,
                                                "cost": cost,
                                                "limit": limit,
                                            }),
                                        );
                                    }
                                }
                            }
                        }
                    }

                    pending.extend_from_slice(&bytes);
                    if pending.len() > MAX_PENDING_BYTES {
                        let keep_from = pending.len() - MAX_BATCH_BYTES;
                        pending.drain(..keep_from);
                    }
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

pub(super) fn spawn_terminal_monitor(
    state: AppState,
    workspace_id: String,
    _session_role: String,
    session_id: String,
    mut child: Box<dyn portable_pty::Child + Send>,
) {
    thread::spawn(move || {
        let wait_result = child.wait();
        let ended_at = terminal_service::timestamp();

        let was_active = state
            .terminals
            .lock()
            .map(|registry| registry.contains_key(&session_id))
            .unwrap_or(false);

        let _ = state.terminals.lock().map(|mut registry| {
            registry.remove(&session_id);
        });

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

pub(super) fn ensure_agent_session_for_prompt(
    state: &AppState,
    workspace_id: &str,
    profile: &str,
) -> Result<TerminalSession, String> {
    if let Some(active) = active_for_workspace(state, workspace_id, "agent")? {
        return terminal_repository::get_session(&state.db, &active.session_id)?
            .ok_or_else(|| "Active agent session record was not found".to_string());
    }

    terminal_service::start_workspace_terminal_session(
        state,
        StartTerminalSessionInput {
            workspace_id: workspace_id.to_string(),
            profile: profile.to_string(),
            session_role: Some("agent".to_string()),
            cols: None,
            rows: None,
            replace_existing: Some(false),
        },
    )
}
