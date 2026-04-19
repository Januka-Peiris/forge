use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, OptionalExtension};

use crate::models::{
    TerminalSession, WorkspaceHealth, WorkspaceSessionRecoveryAction,
    WorkspaceSessionRecoveryResult, WorkspaceTerminalHealth,
};
use crate::repositories::{activity_repository, terminal_repository, workspace_repository};
use crate::services::terminal_service;
use crate::state::AppState;

/// Agent sessions are flagged as stuck if they produce no PTY output for this long.
const STUCK_THRESHOLD_SECS: u64 = 120;

pub fn get_workspace_health(
    state: &AppState,
    workspace_id: &str,
) -> Result<WorkspaceHealth, String> {
    workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;

    let sessions = terminal_repository::list_for_workspace(&state.db, workspace_id)?
        .into_iter()
        .filter(|session| session.closed_at.is_none())
        .collect::<Vec<_>>();

    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let mut warnings = Vec::new();
    let mut terminals = Vec::with_capacity(sessions.len());
    for session in sessions {
        let attached = is_attached(state, &session.id);
        let last_output_at = latest_output_at(state, &session.id)?;
        let stale = session.stale;
        let recommended_action = recommend_terminal_action(&session, attached, stale);
        let stuck_since = detect_stuck(state, &session, now_secs);
        if stale {
            warnings.push(format!(
                "{} is stale — {}",
                terminal_label(&session),
                recommended_action
            ));
        }
        if stuck_since.is_some() {
            warnings.push(format!(
                "{} appears stuck — no output for >2 minutes",
                terminal_label(&session)
            ));
        }
        terminals.push(WorkspaceTerminalHealth {
            session_id: session.id,
            title: session.title,
            kind: session.terminal_kind,
            profile: session.profile,
            status: session.status,
            backend: session.backend,
            attached,
            stale,
            last_output_at,
            recommended_action,
            stuck_since,
        });
    }

    // Port discovery is intentionally not run here: it shells out to `lsof` twice (listeners + cwd map)
    // and was dominating CPU/RAM when health polled frequently. Use `list_workspace_ports` from the
    // Testing tab when the user wants an on-demand scan.
    let ports = Vec::new();

    let status = derive_workspace_health_status(&terminals, &ports, &warnings);
    Ok(WorkspaceHealth {
        workspace_id: workspace_id.to_string(),
        status,
        terminals,
        ports,
        warnings,
    })
}

pub fn recover_workspace_sessions(
    state: &AppState,
    workspace_id: &str,
) -> Result<WorkspaceSessionRecoveryResult, String> {
    let workspace = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let health = get_workspace_health(state, workspace_id)?;
    let mut closed_sessions = 0u32;
    let mut skipped_sessions = 0u32;
    let mut actions = Vec::new();
    let mut warnings = Vec::new();

    for terminal in health.terminals {
        let recovery_reason = terminal_recovery_reason(&terminal);
        if recovery_reason.is_none() {
            skipped_sessions += 1;
            actions.push(WorkspaceSessionRecoveryAction {
                session_id: terminal.session_id,
                title: terminal.title,
                action: "skipped".to_string(),
                reason: "Session looks healthy enough to keep visible.".to_string(),
            });
            continue;
        }
        let reason = recovery_reason.unwrap_or_else(|| "Session is unhealthy.".to_string());
        match terminal_service::close_workspace_terminal_session_by_id(state, &terminal.session_id)
        {
            Ok(_) => {
                closed_sessions += 1;
                actions.push(WorkspaceSessionRecoveryAction {
                    session_id: terminal.session_id,
                    title: terminal.title,
                    action: "closed".to_string(),
                    reason,
                });
            }
            Err(err) => {
                warnings.push(format!("Could not close {}: {err}", terminal.title));
                actions.push(WorkspaceSessionRecoveryAction {
                    session_id: terminal.session_id,
                    title: terminal.title,
                    action: "failed".to_string(),
                    reason: format!("{reason} Close failed: {err}"),
                });
            }
        }
    }

    let details = if warnings.is_empty() {
        format!("Closed {closed_sessions} stale/unhealthy session(s); skipped {skipped_sessions}.")
    } else {
        format!(
            "Closed {closed_sessions} stale/unhealthy session(s); skipped {skipped_sessions}; {} warning(s).",
            warnings.len()
        )
    };
    let _ = activity_repository::record(
        &state.db,
        workspace_id,
        &workspace.summary.repo,
        Some(&workspace.summary.branch),
        "Workspace sessions recovered",
        if warnings.is_empty() {
            "info"
        } else {
            "warning"
        },
        Some(&details),
    );

    Ok(WorkspaceSessionRecoveryResult {
        workspace_id: workspace_id.to_string(),
        closed_sessions,
        skipped_sessions,
        actions,
        warnings,
    })
}

fn terminal_recovery_reason(terminal: &WorkspaceTerminalHealth) -> Option<String> {
    if terminal.stale {
        return Some(
            "Session was marked stale after app restart or lost process state.".to_string(),
        );
    }
    if terminal.stuck_since.is_some() {
        return Some("Session appeared stuck with no recent output.".to_string());
    }
    if terminal.status == "failed" {
        return Some("Session had failed.".to_string());
    }
    if terminal.status == "interrupted" {
        return Some("Session had been interrupted.".to_string());
    }
    if terminal.status == "running" && !terminal.attached {
        return Some("Session was running but not attached to an active PTY.".to_string());
    }
    None
}

fn is_attached(state: &AppState, session_id: &str) -> bool {
    state
        .terminals
        .lock()
        .map(|registry| registry.contains_key(session_id))
        .unwrap_or(false)
}

/// Returns the unix timestamp (as a string) when the session became stuck, or None.
/// Only agent sessions that are running and have had at least some output are checked.
fn detect_stuck(state: &AppState, session: &TerminalSession, now_secs: u64) -> Option<String> {
    if session.status != "running" || session.session_role != "agent" {
        return None;
    }
    let last_secs = state.terminals.lock().ok().and_then(|registry| {
        registry
            .get(&session.id)
            .map(|a| a.last_output_at_secs.load(Ordering::Relaxed))
    })?;
    // 0 means no output yet — session just started, not stuck.
    if last_secs == 0 {
        return None;
    }
    if now_secs.saturating_sub(last_secs) >= STUCK_THRESHOLD_SECS {
        // Report when silence started.
        let stuck_since = last_secs + STUCK_THRESHOLD_SECS;
        Some(stuck_since.to_string())
    } else {
        None
    }
}

fn latest_output_at(state: &AppState, session_id: &str) -> Result<Option<String>, String> {
    state.db.with_connection(|connection| {
        connection
            .query_row(
                r#"
                SELECT timestamp
                FROM terminal_output_chunks
                WHERE session_id = ?1
                ORDER BY seq DESC, created_at DESC
                LIMIT 1
                "#,
                params![session_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
    })
}

fn terminal_label(session: &TerminalSession) -> String {
    if session.title.trim().is_empty() {
        session.id.clone()
    } else {
        session.title.clone()
    }
}

pub fn recommend_terminal_action(session: &TerminalSession, attached: bool, stale: bool) -> String {
    if session.closed_at.is_some() {
        return "history only".to_string();
    }
    if stale || session.stale {
        return "close it or start a fresh terminal".to_string();
    }
    match session.status.as_str() {
        "running" if attached => "healthy".to_string(),
        "running" => "start new".to_string(),
        "failed" => "inspect output or restart".to_string(),
        "interrupted" => "close or restart".to_string(),
        "stopped" | "succeeded" => "close when done".to_string(),
        _ => "review".to_string(),
    }
}

pub fn derive_workspace_health_status(
    terminals: &[WorkspaceTerminalHealth],
    ports: &[crate::models::WorkspacePort],
    warnings: &[String],
) -> String {
    if !warnings.is_empty()
        || terminals.iter().any(|terminal| {
            terminal.stale || matches!(terminal.status.as_str(), "failed" | "interrupted")
        })
    {
        "needs_attention".to_string()
    } else if terminals
        .iter()
        .any(|terminal| terminal.status == "running")
        || !ports.is_empty()
    {
        "healthy".to_string()
    } else {
        "idle".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(status: &str, stale: bool) -> TerminalSession {
        TerminalSession {
            id: "term-1".to_string(),
            workspace_id: "ws-1".to_string(),
            session_role: "agent".to_string(),
            profile: "codex".to_string(),
            cwd: "/tmp/ws".to_string(),
            status: status.to_string(),
            started_at: "1".to_string(),
            ended_at: None,
            command: "codex".to_string(),
            args: vec![],
            pid: None,
            stale,
            closed_at: None,
            backend: "pty".to_string(),
            title: "Codex".to_string(),
            terminal_kind: "agent".to_string(),
            display_order: 0,
            is_visible: true,
            last_attached_at: None,
            last_captured_seq: 0,
        }
    }

    #[test]
    fn recommends_start_new_for_unattached_running() {
        assert_eq!(
            recommend_terminal_action(&session("running", false), false, false),
            "start new"
        );
    }

    #[test]
    fn recommends_fresh_terminal_for_stale_session() {
        assert_eq!(
            recommend_terminal_action(&session("running", true), false, true),
            "close it or start a fresh terminal"
        );
    }

    #[test]
    fn explains_recovery_reason_for_stale_sessions() {
        let terminal = WorkspaceTerminalHealth {
            session_id: "term-1".to_string(),
            title: "Codex".to_string(),
            kind: "agent".to_string(),
            profile: "codex".to_string(),
            status: "running".to_string(),
            backend: "pty".to_string(),
            attached: false,
            stale: true,
            last_output_at: None,
            recommended_action: "close it or start a fresh terminal".to_string(),
            stuck_since: None,
        };

        assert!(terminal_recovery_reason(&terminal)
            .unwrap()
            .contains("stale"));
    }

    #[test]
    fn derives_health_status_from_terminals() {
        let healthy_terminal = WorkspaceTerminalHealth {
            session_id: "term-1".to_string(),
            title: "Codex".to_string(),
            kind: "agent".to_string(),
            profile: "codex".to_string(),
            status: "running".to_string(),
            backend: "pty".to_string(),
            attached: true,
            stale: false,
            last_output_at: None,
            recommended_action: "healthy".to_string(),
            stuck_since: None,
        };
        assert_eq!(
            derive_workspace_health_status(&[healthy_terminal], &[], &[]),
            "healthy"
        );
        assert_eq!(derive_workspace_health_status(&[], &[], &[]), "idle");
        assert_eq!(
            derive_workspace_health_status(&[], &[], &["warn".to_string()]),
            "needs_attention"
        );
    }
}
