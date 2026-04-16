use rusqlite::{params, OptionalExtension};

use crate::db::Database;
use crate::models::{WorkspaceRun, WorkspaceRunLog};

pub fn insert_run(db: &Database, run: &WorkspaceRun) -> Result<(), String> {
    let args = serde_json::to_string(&run.args)
        .map_err(|err| format!("Failed to serialize args: {err}"))?;
    db.with_connection(|connection| {
        connection.execute(
            r#"
            INSERT INTO workspace_runs (
                id, workspace_id, agent_type, command, args, cwd, status, pid,
                started_at, finished_at, exit_code, error_message, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, CURRENT_TIMESTAMP)
            "#,
            params![
                run.id,
                run.workspace_id,
                run.agent_type,
                run.command,
                args,
                run.cwd,
                run.status,
                run.pid,
                run.started_at,
                run.finished_at,
                run.exit_code,
                run.error_message,
            ],
        )?;
        Ok(())
    })
}

pub fn list_runs_for_workspace(
    db: &Database,
    workspace_id: &str,
) -> Result<Vec<WorkspaceRun>, String> {
    db.with_connection(|connection| {
        let mut stmt = connection.prepare(
            r#"
            SELECT id, workspace_id, agent_type, command, args, cwd, status, pid,
                   started_at, finished_at, exit_code, error_message
            FROM workspace_runs
            WHERE workspace_id = ?1
            ORDER BY created_at DESC, rowid DESC
            "#,
        )?;
        let runs = stmt
            .query_map(params![workspace_id], run_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(runs)
    })
}

pub fn get_run(db: &Database, run_id: &str) -> Result<Option<WorkspaceRun>, String> {
    db.with_connection(|connection| {
        connection
            .query_row(
                r#"
                SELECT id, workspace_id, agent_type, command, args, cwd, status, pid,
                       started_at, finished_at, exit_code, error_message
                FROM workspace_runs
                WHERE id = ?1
                "#,
                params![run_id],
                run_from_row,
            )
            .optional()
    })
}

pub fn active_run_for_workspace(
    db: &Database,
    workspace_id: &str,
) -> Result<Option<WorkspaceRun>, String> {
    db.with_connection(|connection| {
        connection
            .query_row(
                r#"
                SELECT id, workspace_id, agent_type, command, args, cwd, status, pid,
                       started_at, finished_at, exit_code, error_message
                FROM workspace_runs
                WHERE workspace_id = ?1 AND status = 'running'
                ORDER BY created_at DESC, rowid DESC
                LIMIT 1
                "#,
                params![workspace_id],
                run_from_row,
            )
            .optional()
    })
}

pub fn mark_finished(
    db: &Database,
    run_id: &str,
    status: &str,
    exit_code: Option<i32>,
    error_message: Option<&str>,
    finished_at: &str,
) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE workspace_runs
            SET status = ?2,
                finished_at = ?3,
                exit_code = ?4,
                error_message = ?5,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?1
            "#,
            params![run_id, status, finished_at, exit_code, error_message],
        )?;
        Ok(())
    })
}

pub fn mark_stale_running_abandoned(db: &Database, timestamp: &str) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            UPDATE workspace_runs
            SET status = 'abandoned',
                finished_at = ?1,
                error_message = 'Forge restarted before this run completed',
                updated_at = CURRENT_TIMESTAMP
            WHERE status = 'running'
            "#,
            params![timestamp],
        )?;
        Ok(())
    })
}

pub fn insert_log(db: &Database, log: &WorkspaceRunLog) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            INSERT INTO workspace_run_logs (id, run_id, timestamp, stream_type, message)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
            params![
                log.id,
                log.run_id,
                log.timestamp,
                log.stream_type,
                log.message
            ],
        )?;
        Ok(())
    })
}

pub fn list_logs(db: &Database, run_id: &str) -> Result<Vec<WorkspaceRunLog>, String> {
    db.with_connection(|connection| {
        let mut stmt = connection.prepare(
            r#"
            SELECT id, run_id, timestamp, stream_type, message
            FROM workspace_run_logs
            WHERE run_id = ?1
            ORDER BY created_at ASC, rowid ASC
            "#,
        )?;
        let logs = stmt
            .query_map(params![run_id], |row| {
                Ok(WorkspaceRunLog {
                    id: row.get("id")?,
                    run_id: row.get("run_id")?,
                    timestamp: row.get("timestamp")?,
                    stream_type: row.get("stream_type")?,
                    message: row.get("message")?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(logs)
    })
}

fn run_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkspaceRun> {
    let args_json: String = row.get("args")?;
    Ok(WorkspaceRun {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        agent_type: row.get("agent_type")?,
        command: row.get("command")?,
        args: serde_json::from_str(&args_json).unwrap_or_default(),
        cwd: row.get("cwd")?,
        status: row.get("status")?,
        pid: row.get("pid")?,
        started_at: row.get("started_at")?,
        finished_at: row.get("finished_at")?,
        exit_code: row.get("exit_code")?,
        error_message: row.get("error_message")?,
    })
}
