use rusqlite::params;

use crate::db::Database;
use crate::models::{TaskEvent, TaskRun};

pub fn start_or_resume_run(
    db: &Database,
    workspace_id: &str,
    kind: &str,
    source_id: Option<&str>,
    started_at: &str,
) -> Result<String, String> {
    let run_id = format!(
        "task-{workspace_id}-{kind}-{}",
        source_id.unwrap_or("default")
    );
    db.with_connection_mut(|connection| {
        connection.execute(
            r#"
            INSERT INTO task_runs (id, workspace_id, kind, status, source_id, started_at, ended_at, updated_at)
            VALUES (?1, ?2, ?3, 'running', ?4, ?5, NULL, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET
                status = 'running',
                source_id = excluded.source_id,
                ended_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            "#,
            params![run_id, workspace_id, kind, source_id, started_at],
        )?;
        Ok(())
    })?;
    Ok(run_id)
}

pub fn mark_run_status(
    db: &Database,
    run_id: &str,
    status: &str,
    ended_at: Option<&str>,
) -> Result<(), String> {
    db.with_connection_mut(|connection| {
        connection.execute(
            r#"
            UPDATE task_runs
            SET status = ?2,
                ended_at = COALESCE(?3, ended_at),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            "#,
            params![run_id, status, ended_at],
        )?;
        Ok(())
    })
}

pub fn append_event(
    db: &Database,
    task_run_id: &str,
    workspace_id: &str,
    ts: &str,
    event_type: &str,
    payload: &serde_json::Value,
) -> Result<(), String> {
    let id = format!("event-{task_run_id}-{event_type}-{ts}");
    let payload_text = serde_json::to_string(payload).unwrap_or_else(|_| "{}".to_string());
    db.with_connection_mut(|connection| {
        connection.execute(
            "INSERT OR REPLACE INTO task_events (id, task_run_id, workspace_id, ts, event_type, payload) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![id, task_run_id, workspace_id, ts, event_type, payload_text],
        )?;
        Ok(())
    })
}

pub fn list_runs_for_workspace(
    db: &Database,
    workspace_id: &str,
    limit: usize,
) -> Result<Vec<TaskRun>, String> {
    db.with_connection(|connection| {
        let mut statement = connection.prepare(
            r#"
            SELECT id, workspace_id, kind, status, source_id, started_at, ended_at
            FROM task_runs
            WHERE workspace_id = ?1
            ORDER BY updated_at DESC, rowid DESC
            LIMIT ?2
            "#,
        )?;
        let runs = statement
            .query_map(params![workspace_id, limit as i64], |row| {
                Ok(TaskRun {
                    id: row.get("id")?,
                    workspace_id: row.get("workspace_id")?,
                    kind: row.get("kind")?,
                    status: row.get("status")?,
                    source_id: row.get("source_id")?,
                    started_at: row.get("started_at")?,
                    ended_at: row.get("ended_at")?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(runs)
    })
}

pub fn list_events_for_workspace(
    db: &Database,
    workspace_id: &str,
    limit: usize,
) -> Result<Vec<TaskEvent>, String> {
    db.with_connection(|connection| {
        let mut statement = connection.prepare(
            r#"
            SELECT id, task_run_id, workspace_id, ts, event_type, payload
            FROM task_events
            WHERE workspace_id = ?1
            ORDER BY ts DESC, rowid DESC
            LIMIT ?2
            "#,
        )?;
        let events = statement
            .query_map(params![workspace_id, limit as i64], |row| {
                let payload_text: String = row.get("payload")?;
                Ok(TaskEvent {
                    id: row.get("id")?,
                    task_run_id: row.get("task_run_id")?,
                    workspace_id: row.get("workspace_id")?,
                    ts: row.get("ts")?,
                    event_type: row.get("event_type")?,
                    payload: serde_json::from_str(&payload_text)
                        .unwrap_or_else(|_| serde_json::json!({})),
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(events)
    })
}
