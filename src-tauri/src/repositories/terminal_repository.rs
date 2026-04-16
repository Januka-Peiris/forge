use rusqlite::{params, OptionalExtension};

use crate::db::Database;
use crate::models::{AgentPromptEntry, TerminalOutputChunk, TerminalSession};

pub fn insert_session(db: &Database, session: &TerminalSession) -> Result<(), String> {
    let args = serde_json::to_string(&session.args)
        .map_err(|err| format!("Failed to serialize terminal session args: {err}"))?;
    db.with_connection(|connection| {
        connection.execute(
            r#"
            INSERT INTO terminal_sessions (
                id, workspace_id, session_role, profile, cwd, status, started_at, ended_at,
                command, args, pid, stale, closed_at, backend, tmux_session_name, title,
                terminal_kind, display_order, is_visible, last_attached_at, last_captured_seq, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, CURRENT_TIMESTAMP)
            "#,
            params![
                session.id,
                session.workspace_id,
                session.session_role,
                session.profile,
                session.cwd,
                session.status,
                session.started_at,
                session.ended_at,
                session.command,
                args,
                session.pid,
                session.stale as i64,
                session.closed_at,
                session.backend,
                Option::<String>::None,
                session.title,
                session.terminal_kind,
                session.display_order,
                session.is_visible as i64,
                session.last_attached_at,
                session.last_captured_seq,
            ],
        )?;
        Ok(())
    })
}

pub fn get_session(db: &Database, session_id: &str) -> Result<Option<TerminalSession>, String> {
    db.with_connection(|connection| {
        connection
            .query_row(
                r#"
                SELECT id, workspace_id, session_role, profile, cwd, status, started_at, ended_at,
                       command, args, pid, stale, closed_at, backend, tmux_session_name, title, terminal_kind,
                       display_order, is_visible, last_attached_at, last_captured_seq
                FROM terminal_sessions
                WHERE id = ?1
                "#,
                params![session_id],
                session_from_row,
            )
            .optional()
    })
}

pub fn latest_for_workspace_role(
    db: &Database,
    workspace_id: &str,
    session_role: &str,
) -> Result<Option<TerminalSession>, String> {
    db.with_connection(|connection| {
        connection
            .query_row(
                r#"
                SELECT id, workspace_id, session_role, profile, cwd, status, started_at, ended_at,
                       command, args, pid, stale, closed_at, backend, tmux_session_name, title, terminal_kind,
                       display_order, is_visible, last_attached_at, last_captured_seq
                FROM terminal_sessions
                WHERE workspace_id = ?1 AND session_role = ?2 AND closed_at IS NULL
                ORDER BY created_at DESC, rowid DESC
                LIMIT 1
                "#,
                params![workspace_id, session_role],
                session_from_row,
            )
            .optional()
    })
}

pub fn list_for_workspace(
    db: &Database,
    workspace_id: &str,
) -> Result<Vec<TerminalSession>, String> {
    db.with_connection(|connection| {
        let mut stmt = connection.prepare(
            r#"
            SELECT id, workspace_id, session_role, profile, cwd, status, started_at, ended_at,
                   command, args, pid, stale, closed_at, backend, tmux_session_name, title, terminal_kind,
                   display_order, is_visible, last_attached_at, last_captured_seq
            FROM terminal_sessions
            WHERE workspace_id = ?1
            ORDER BY created_at DESC, rowid DESC
            "#,
        )?;
        let sessions = stmt
            .query_map(params![workspace_id], session_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(sessions)
    })
}

pub fn list_visible_for_workspace(
    db: &Database,
    workspace_id: &str,
) -> Result<Vec<TerminalSession>, String> {
    db.with_connection(|connection| {
        let mut stmt = connection.prepare(
            r#"
            SELECT id, workspace_id, session_role, profile, cwd, status, started_at, ended_at,
                   command, args, pid, stale, closed_at, backend, tmux_session_name, title, terminal_kind,
                   display_order, is_visible, last_attached_at, last_captured_seq
            FROM terminal_sessions
            WHERE workspace_id = ?1 AND closed_at IS NULL AND is_visible = 1
            ORDER BY display_order ASC, created_at ASC, rowid ASC
            "#,
        )?;
        let sessions = stmt
            .query_map(params![workspace_id], session_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(sessions)
    })
}

pub fn next_display_order(db: &Database, workspace_id: &str) -> Result<i64, String> {
    db.with_connection(|connection| {
        let next = connection.query_row(
            "SELECT COALESCE(MAX(display_order) + 1, 0) FROM terminal_sessions WHERE workspace_id = ?1",
            params![workspace_id],
            |row| row.get::<_, i64>(0),
        )?;
        Ok(next)
    })
}

pub fn mark_finished(
    db: &Database,
    session_id: &str,
    status: &str,
    ended_at: &str,
    stale: bool,
) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE terminal_sessions
            SET status = ?2,
                ended_at = COALESCE(ended_at, ?3),
                stale = ?4,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            "#,
            params![session_id, status, ended_at, stale as i64],
        )?;
        Ok(())
    })
}

pub fn mark_closed(db: &Database, session_id: &str, closed_at: &str) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE terminal_sessions
            SET closed_at = COALESCE(closed_at, ?2),
                is_visible = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            "#,
            params![session_id, closed_at],
        )?;
        Ok(())
    })
}

#[allow(dead_code)]
pub fn mark_attached(db: &Database, session_id: &str, attached_at: &str) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE terminal_sessions
            SET last_attached_at = ?2,
                stale = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            "#,
            params![session_id, attached_at],
        )?;
        Ok(())
    })
}

#[allow(dead_code)]
pub fn mark_captured(db: &Database, session_id: &str, seq: i64) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE terminal_sessions
            SET last_captured_seq = ?2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            "#,
            params![session_id, seq],
        )?;
        Ok(())
    })
}

pub fn mark_stale_running_sessions(db: &Database, timestamp: &str) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE terminal_sessions
            SET status = 'interrupted',
                ended_at = COALESCE(ended_at, ?1),
                stale = 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE status = 'running'
            "#,
            params![timestamp],
        )?;
        Ok(())
    })
}

pub fn insert_output_chunk(db: &Database, chunk: &TerminalOutputChunk) -> Result<(), String> {
    insert_output_chunks(db, std::slice::from_ref(chunk))
}

pub fn insert_output_chunks(db: &Database, chunks: &[TerminalOutputChunk]) -> Result<(), String> {
    if chunks.is_empty() {
        return Ok(());
    }
    db.with_connection_mut(|connection| {
        let transaction = connection.transaction()?;
        {
            let mut stmt = transaction.prepare(
                r#"
                INSERT OR IGNORE INTO terminal_output_chunks (
                    id, session_id, seq, timestamp, stream_type, data
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                "#,
            )?;
            for chunk in chunks {
                stmt.execute(params![
                    chunk.id,
                    chunk.session_id,
                    chunk.seq as i64,
                    chunk.timestamp,
                    chunk.stream_type,
                    chunk.data,
                ])?;
            }
        }
        transaction.commit()?;
        Ok(())
    })
}

/// Delete old output chunks for a session, keeping only the most recent `keep` rows.
pub fn prune_output_chunks(db: &Database, session_id: &str, keep: u32) -> Result<(), String> {
    db.with_connection_mut(|connection| {
        connection.execute(
            r#"
            DELETE FROM terminal_output_chunks
            WHERE session_id = ?1
              AND seq < (
                SELECT COALESCE(MAX(seq) - ?2 + 1, 0)
                FROM terminal_output_chunks
                WHERE session_id = ?1
              )
            "#,
            params![session_id, keep],
        )?;
        Ok(())
    })
}

pub fn list_output_chunks(
    db: &Database,
    session_id: &str,
    since_seq: u64,
) -> Result<Vec<TerminalOutputChunk>, String> {
    const INITIAL_TAIL_LIMIT: i64 = 600;
    const INCREMENTAL_LIMIT: i64 = 1000;

    db.with_connection(|connection| {
        let rows = if since_seq == 0 {
            let mut stmt = connection.prepare(
                r#"
                SELECT id, session_id, seq, timestamp, stream_type, data
                FROM terminal_output_chunks
                WHERE session_id = ?1
                ORDER BY seq DESC
                LIMIT ?2
                "#,
            )?;
            let mut chunks = stmt
                .query_map(
                    params![session_id, INITIAL_TAIL_LIMIT],
                    terminal_output_chunk_from_row,
                )?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            chunks.reverse();
            chunks
        } else {
            let mut stmt = connection.prepare(
                r#"
                SELECT id, session_id, seq, timestamp, stream_type, data
                FROM terminal_output_chunks
                WHERE session_id = ?1 AND seq >= ?2
                ORDER BY seq ASC
                LIMIT ?3
                "#,
            )?;
            let chunks = stmt
                .query_map(
                    params![session_id, since_seq as i64, INCREMENTAL_LIMIT],
                    terminal_output_chunk_from_row,
                )?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            chunks
        };
        Ok(rows)
    })
}

fn terminal_output_chunk_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<TerminalOutputChunk> {
    Ok(TerminalOutputChunk {
        id: row.get("id")?,
        session_id: row.get("session_id")?,
        seq: row.get::<_, i64>("seq")? as u64,
        timestamp: row.get("timestamp")?,
        stream_type: row.get("stream_type")?,
        data: row.get("data")?,
    })
}

pub fn next_seq(db: &Database, session_id: &str) -> Result<u64, String> {
    db.with_connection(|connection| {
        let next: i64 = connection.query_row(
            "SELECT COALESCE(MAX(seq) + 1, 0) FROM terminal_output_chunks WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;
        Ok(next.max(0) as u64)
    })
}

fn session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<TerminalSession> {
    let args_json: String = row.get("args")?;
    Ok(TerminalSession {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        session_role: row
            .get::<_, Option<String>>("session_role")?
            .unwrap_or_else(|| "agent".to_string()),
        profile: row.get("profile")?,
        cwd: row.get("cwd")?,
        status: row.get("status")?,
        started_at: row.get("started_at")?,
        ended_at: row.get("ended_at")?,
        command: row.get("command")?,
        args: serde_json::from_str(&args_json).unwrap_or_default(),
        pid: row.get("pid")?,
        stale: row.get::<_, i64>("stale")? != 0,
        closed_at: row.get("closed_at")?,
        backend: row
            .get::<_, Option<String>>("backend")?
            .unwrap_or_else(|| "pty".to_string()),
        title: row.get::<_, Option<String>>("title")?.unwrap_or_default(),
        terminal_kind: row
            .get::<_, Option<String>>("terminal_kind")?
            .unwrap_or_else(|| "agent".to_string()),
        display_order: row.get::<_, Option<i64>>("display_order")?.unwrap_or(0),
        is_visible: row.get::<_, Option<i64>>("is_visible")?.unwrap_or(1) != 0,
        last_attached_at: row.get("last_attached_at")?,
        last_captured_seq: row.get::<_, Option<i64>>("last_captured_seq")?.unwrap_or(0),
    })
}

pub fn insert_prompt_entry(db: &Database, entry: &AgentPromptEntry) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            INSERT INTO terminal_prompt_entries (
                id, workspace_id, session_id, profile, prompt, status, created_at, sent_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, CURRENT_TIMESTAMP)
            "#,
            params![
                entry.id,
                entry.workspace_id,
                entry.session_id,
                entry.profile,
                entry.prompt,
                entry.status,
                entry.created_at,
                entry.sent_at,
            ],
        )?;
        Ok(())
    })
}

pub fn mark_prompt_sent(
    db: &Database,
    prompt_id: &str,
    session_id: &str,
    sent_at: &str,
) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE terminal_prompt_entries
            SET status = 'sent',
                session_id = ?2,
                sent_at = ?3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            "#,
            params![prompt_id, session_id, sent_at],
        )?;
        Ok(())
    })
}

pub fn mark_prompt_status_by_session(
    db: &Database,
    session_id: &str,
    status: &str,
) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE terminal_prompt_entries
            SET status = ?2,
                updated_at = CURRENT_TIMESTAMP
            WHERE session_id = ?1 AND status IN ('sent', 'running')
            "#,
            params![session_id, status],
        )?;
        Ok(())
    })
}

pub fn list_prompts_for_workspace(
    db: &Database,
    workspace_id: &str,
    limit: Option<u32>,
) -> Result<Vec<AgentPromptEntry>, String> {
    db.with_connection(|connection| {
        let limit = limit.unwrap_or(50) as i64;
        let mut statement = connection.prepare(
            r#"
            SELECT id, workspace_id, session_id, profile, prompt, status, created_at, sent_at
            FROM terminal_prompt_entries
            WHERE workspace_id = ?1
            ORDER BY created_at DESC
            LIMIT ?2
            "#,
        )?;
        let entries = statement
            .query_map(params![workspace_id, limit], |row| {
                Ok(AgentPromptEntry {
                    id: row.get("id")?,
                    workspace_id: row.get("workspace_id")?,
                    session_id: row.get("session_id")?,
                    profile: row.get("profile")?,
                    prompt: row.get("prompt")?,
                    status: row.get("status")?,
                    created_at: row.get("created_at")?,
                    sent_at: row.get("sent_at")?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(entries)
    })
}

pub fn latest_queued_prompt_for_workspace(
    db: &Database,
    workspace_id: &str,
) -> Result<Option<AgentPromptEntry>, String> {
    db.with_connection(|connection| {
        connection
            .query_row(
                r#"
                SELECT id, workspace_id, session_id, profile, prompt, status, created_at, sent_at
                FROM terminal_prompt_entries
                WHERE workspace_id = ?1 AND status = 'queued'
                ORDER BY created_at ASC
                LIMIT 1
                "#,
                params![workspace_id],
                |row| {
                    Ok(AgentPromptEntry {
                        id: row.get("id")?,
                        workspace_id: row.get("workspace_id")?,
                        session_id: row.get("session_id")?,
                        profile: row.get("profile")?,
                        prompt: row.get("prompt")?,
                        status: row.get("status")?,
                        created_at: row.get("created_at")?,
                        sent_at: row.get("sent_at")?,
                    })
                },
            )
            .optional()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db_with_workspace() -> Database {
        let db = Database::in_memory().expect("in-memory database");
        db.with_connection(|connection| {
            connection.execute(
                r#"
                INSERT INTO workspaces (
                    id, name, repo, branch, agent, status, current_step, completed_steps,
                    last_updated, description, current_task, merge_risk, last_rebase, base_branch,
                    agent_session_id, agent_session_agent, agent_session_status,
                    agent_session_model, agent_session_estimated_cost, agent_session_last_message,
                    agent_session_started_at, worktree_path, recent_events
                ) VALUES (
                    'ws-1', 'Test Workspace', 'repo', 'branch', 'Codex', 'Waiting', 'Planning', '[]',
                    'now', 'desc', 'task', 'Low', 'never', 'main',
                    'agent-session-1', 'Codex', 'idle',
                    'local', '$0.00', 'none',
                    'not started', '/tmp/ws-1', '[]'
                )
                "#,
                [],
            )?;
            Ok(())
        })
        .expect("workspace insert");
        db
    }

    fn session(id: &str, status: &str) -> TerminalSession {
        TerminalSession {
            id: id.to_string(),
            workspace_id: "ws-1".to_string(),
            session_role: "agent".to_string(),
            profile: "codex".to_string(),
            cwd: "/tmp/ws-1".to_string(),
            status: status.to_string(),
            started_at: "1".to_string(),
            ended_at: None,
            command: "codex".to_string(),
            args: vec![],
            pid: Some(1234),
            stale: false,
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
    fn closed_sessions_are_hidden_from_latest_but_retained_in_history() {
        let db = db_with_workspace();
        insert_session(&db, &session("term-1", "stopped")).expect("insert session");

        assert_eq!(
            latest_for_workspace_role(&db, "ws-1", "agent")
                .expect("latest")
                .map(|session| session.id),
            Some("term-1".to_string())
        );

        mark_closed(&db, "term-1", "2").expect("close session");

        assert!(latest_for_workspace_role(&db, "ws-1", "agent")
            .expect("latest")
            .is_none());
        let history = list_for_workspace(&db, "ws-1").expect("history");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].id, "term-1");
        assert_eq!(history[0].closed_at.as_deref(), Some("2"));
    }
}
