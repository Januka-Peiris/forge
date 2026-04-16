use rusqlite::{params, OptionalExtension};

use crate::models::{TerminalSession, WorkspaceHealth, WorkspaceTerminalHealth};
use crate::repositories::{terminal_repository, workspace_repository};
use crate::services::tmux_service;
use crate::state::AppState;

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

    let mut warnings = Vec::new();
    let mut terminals = Vec::with_capacity(sessions.len());
    for session in sessions {
        let tmux_alive = terminal_tmux_alive(&session);
        if session.backend == "tmux" && session.status == "running" && !tmux_alive {
            let now = crate::services::terminal_service::timestamp();
            terminal_repository::mark_finished(&state.db, &session.id, "interrupted", &now, true)?;
        }
        let refreshed =
            terminal_repository::get_session(&state.db, &session.id)?.unwrap_or(session);
        let attached = is_attached(state, &refreshed.id);
        let last_output_at = latest_output_at(state, &refreshed.id)?;
        let stale = refreshed.stale
            || (refreshed.backend == "tmux" && refreshed.status == "running" && !tmux_alive);
        let recommended_action = recommend_terminal_action(&refreshed, tmux_alive, attached, stale);
        if stale {
            warnings.push(format!(
                "{} is stale — {}",
                terminal_label(&refreshed),
                recommended_action
            ));
        }
        terminals.push(WorkspaceTerminalHealth {
            session_id: refreshed.id,
            title: refreshed.title,
            kind: refreshed.terminal_kind,
            profile: refreshed.profile,
            status: refreshed.status,
            backend: refreshed.backend,
            tmux_alive,
            attached,
            stale,
            last_output_at,
            recommended_action,
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

fn is_attached(state: &AppState, session_id: &str) -> bool {
    state
        .terminals
        .lock()
        .map(|registry| registry.contains_key(session_id))
        .unwrap_or(false)
}

fn terminal_tmux_alive(session: &TerminalSession) -> bool {
    if session.backend != "tmux" {
        return false;
    }
    session
        .tmux_session_name
        .as_deref()
        .map(tmux_service::has_session)
        .unwrap_or(false)
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

pub fn recommend_terminal_action(
    session: &TerminalSession,
    tmux_alive: bool,
    attached: bool,
    stale: bool,
) -> String {
    if session.closed_at.is_some() {
        return "history only".to_string();
    }
    if stale || session.stale {
        return "close it or start a fresh terminal".to_string();
    }
    match session.status.as_str() {
        "running" if session.backend == "tmux" && tmux_alive && !attached => "reattach".to_string(),
        "running" if session.backend == "tmux" && tmux_alive && attached => "healthy".to_string(),
        "running" if session.backend == "tmux" => "recover or start new".to_string(),
        "running" if attached => "healthy".to_string(),
        "running" => "reattach".to_string(),
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
            backend: "tmux".to_string(),
            tmux_session_name: Some("forge-test".to_string()),
            title: "Codex".to_string(),
            terminal_kind: "agent".to_string(),
            display_order: 0,
            is_visible: true,
            last_attached_at: None,
            last_captured_seq: 0,
        }
    }

    #[test]
    fn recommends_reattach_for_live_unattached_tmux() {
        assert_eq!(
            recommend_terminal_action(&session("running", false), true, false, false),
            "reattach"
        );
    }

    #[test]
    fn recommends_fresh_terminal_for_stale_session() {
        assert_eq!(
            recommend_terminal_action(&session("running", true), false, false, true),
            "close it or start a fresh terminal"
        );
    }

    #[test]
    fn derives_health_status_from_terminals() {
        let healthy_terminal = WorkspaceTerminalHealth {
            session_id: "term-1".to_string(),
            title: "Codex".to_string(),
            kind: "agent".to_string(),
            profile: "codex".to_string(),
            status: "running".to_string(),
            backend: "tmux".to_string(),
            tmux_alive: true,
            attached: true,
            stale: false,
            last_output_at: None,
            recommended_action: "healthy".to_string(),
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
