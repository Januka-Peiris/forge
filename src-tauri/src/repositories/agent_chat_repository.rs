use rusqlite::{params, OptionalExtension};

use crate::db::Database;
use crate::models::{AgentChatEvent, AgentChatSession};

pub fn insert_session(db: &Database, session: &AgentChatSession) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            INSERT INTO agent_chat_sessions (
                id, workspace_id, provider, status, title, provider_session_id, cwd,
                raw_output, created_at, updated_at, ended_at, closed_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
            params![
                session.id,
                session.workspace_id,
                session.provider,
                session.status,
                session.title,
                session.provider_session_id,
                session.cwd,
                session.raw_output,
                session.created_at,
                session.updated_at,
                session.ended_at,
                session.closed_at,
            ],
        )?;
        Ok(())
    })
}

pub fn update_session_status(
    db: &Database,
    session_id: &str,
    status: &str,
    ended_at: Option<&str>,
) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE agent_chat_sessions
            SET status = ?2,
                ended_at = COALESCE(?3, ended_at),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            "#,
            params![session_id, status, ended_at],
        )?;
        Ok(())
    })
}

pub fn close_session(db: &Database, session_id: &str, closed_at: &str) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE agent_chat_sessions
            SET closed_at = ?2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            "#,
            params![session_id, closed_at],
        )?;
        Ok(())
    })
}

pub fn append_raw_output(db: &Database, session_id: &str, data: &str) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE agent_chat_sessions
            SET raw_output = raw_output || ?2,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            "#,
            params![session_id, data],
        )?;
        Ok(())
    })
}

pub fn get_session(db: &Database, session_id: &str) -> Result<Option<AgentChatSession>, String> {
    db.with_connection(|connection| {
        connection
            .query_row(
                r#"
                SELECT id, workspace_id, provider, status, title, provider_session_id, cwd,
                       raw_output, created_at, updated_at, ended_at, closed_at
                FROM agent_chat_sessions
                WHERE id = ?1
                "#,
                params![session_id],
                agent_chat_session_from_row,
            )
            .optional()
    })
}

pub fn list_sessions_for_workspace(
    db: &Database,
    workspace_id: &str,
) -> Result<Vec<AgentChatSession>, String> {
    db.with_connection(|connection| {
        let mut statement = connection.prepare(
            r#"
            SELECT id, workspace_id, provider, status, title, provider_session_id, cwd,
                   raw_output, created_at, updated_at, ended_at, closed_at
            FROM agent_chat_sessions
            WHERE workspace_id = ?1 AND closed_at IS NULL
            ORDER BY created_at DESC
            "#,
        )?;
        let sessions = statement
            .query_map(params![workspace_id], agent_chat_session_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(sessions)
    })
}

pub fn latest_status_for_workspace(
    db: &Database,
    workspace_id: &str,
) -> Result<Option<String>, String> {
    db.with_connection(|connection| {
        connection
            .query_row(
                r#"
                SELECT status
                FROM agent_chat_sessions
                WHERE workspace_id = ?1 AND closed_at IS NULL
                ORDER BY created_at DESC
                LIMIT 1
                "#,
                params![workspace_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
    })
}

pub fn insert_event(db: &Database, event: &AgentChatEvent) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            INSERT INTO agent_chat_events (
                id, session_id, seq, event_type, role, title, body, status, metadata, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
            params![
                event.id,
                event.session_id,
                event.seq,
                event.event_type,
                event.role,
                event.title,
                event.body,
                event.status,
                event.metadata.as_ref().map(|value| value.to_string()),
                event.created_at,
            ],
        )?;
        Ok(())
    })
}

pub fn next_event_seq(db: &Database, session_id: &str) -> Result<i64, String> {
    db.with_connection(|connection| {
        let seq = connection.query_row(
            "SELECT COALESCE(MAX(seq) + 1, 0) FROM agent_chat_events WHERE session_id = ?1",
            params![session_id],
            |row| row.get::<_, i64>(0),
        )?;
        Ok(seq)
    })
}

pub fn list_events_for_session(
    db: &Database,
    session_id: &str,
) -> Result<Vec<AgentChatEvent>, String> {
    db.with_connection(|connection| {
        let mut statement = connection.prepare(
            r#"
            SELECT id, session_id, seq, event_type, role, title, body, status, metadata, created_at
            FROM agent_chat_events
            WHERE session_id = ?1
            ORDER BY seq ASC
            "#,
        )?;
        let events = statement
            .query_map(params![session_id], agent_chat_event_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(events)
    })
}

fn agent_chat_session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentChatSession> {
    Ok(AgentChatSession {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        provider: row.get("provider")?,
        status: row.get("status")?,
        title: row.get("title")?,
        provider_session_id: row.get("provider_session_id")?,
        cwd: row.get("cwd")?,
        raw_output: row.get("raw_output")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        ended_at: row.get("ended_at")?,
        closed_at: row.get("closed_at")?,
    })
}

fn agent_chat_event_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentChatEvent> {
    let metadata_json: Option<String> = row.get("metadata")?;
    Ok(AgentChatEvent {
        id: row.get("id")?,
        session_id: row.get("session_id")?,
        seq: row.get("seq")?,
        event_type: row.get("event_type")?,
        role: row.get("role")?,
        title: row.get("title")?,
        body: row.get("body")?,
        status: row.get("status")?,
        metadata: metadata_json.and_then(|raw| serde_json::from_str(&raw).ok()),
        created_at: row.get("created_at")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_events_in_seq_order() {
        let db = Database::in_memory().expect("in-memory db");
        db.with_connection(|connection| {
            connection.execute(
                "INSERT INTO workspaces (id, name, repo, branch, agent, status, current_step, completed_steps, last_updated, description, current_task, merge_risk, last_rebase, base_branch, agent_session_id, agent_session_agent, agent_session_status, agent_session_model, agent_session_estimated_cost, agent_session_last_message, agent_session_started_at, worktree_path) VALUES ('ws', 'W', 'r', 'b', 'a', 's', 'c', '[]', '0', '', '', 'low', '', 'main', '', '', '', '', '', '', '', '/tmp')",
                [],
            ).unwrap();
            Ok(())
        }).unwrap();
        let session = AgentChatSession {
            id: "chat-1".into(),
            workspace_id: "ws".into(),
            provider: "claude_code".into(),
            status: "idle".into(),
            title: "Claude".into(),
            provider_session_id: None,
            cwd: "/tmp".into(),
            raw_output: String::new(),
            created_at: "1".into(),
            updated_at: "1".into(),
            ended_at: None,
            closed_at: None,
        };
        insert_session(&db, &session).unwrap();
        let mut event = AgentChatEvent {
            id: "e2".into(),
            session_id: "chat-1".into(),
            seq: 1,
            event_type: "assistant_message".into(),
            role: Some("assistant".into()),
            title: None,
            body: "two".into(),
            status: None,
            metadata: None,
            created_at: "2".into(),
        };
        insert_event(&db, &event).unwrap();
        event.id = "e1".into();
        event.seq = 0;
        event.body = "one".into();
        insert_event(&db, &event).unwrap();
        let events = list_events_for_session(&db, "chat-1").unwrap();
        assert_eq!(
            events.iter().map(|e| e.body.as_str()).collect::<Vec<_>>(),
            vec!["one", "two"]
        );
    }
}
