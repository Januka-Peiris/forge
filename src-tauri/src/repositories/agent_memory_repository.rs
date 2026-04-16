use rusqlite::params;

use crate::db::Database;
use crate::models::AgentMemory;

fn memory_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentMemory> {
    Ok(AgentMemory {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        key: row.get("key")?,
        value: row.get("value")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// List all global memory entries (workspace_id IS NULL).
pub fn list_global(db: &Database) -> Result<Vec<AgentMemory>, String> {
    db.with_connection(|connection| {
        let mut stmt = connection.prepare(
            "SELECT id, workspace_id, key, value, created_at, updated_at
             FROM agent_memory WHERE workspace_id IS NULL ORDER BY key ASC",
        )?;
        let rows = stmt.query_map([], memory_from_row)?.collect();
        rows
    })
}

/// List memory entries for a specific workspace.
pub fn list_for_workspace(db: &Database, workspace_id: &str) -> Result<Vec<AgentMemory>, String> {
    db.with_connection(|connection| {
        let mut stmt = connection.prepare(
            "SELECT id, workspace_id, key, value, created_at, updated_at
             FROM agent_memory WHERE workspace_id = ?1 ORDER BY key ASC",
        )?;
        let rows = stmt.query_map(params![workspace_id], memory_from_row)?.collect();
        rows
    })
}

/// List all memory entries (global + all workspaces).
pub fn list_all(db: &Database) -> Result<Vec<AgentMemory>, String> {
    db.with_connection(|connection| {
        let mut stmt = connection.prepare(
            "SELECT id, workspace_id, key, value, created_at, updated_at
             FROM agent_memory ORDER BY workspace_id ASC NULLS FIRST, key ASC",
        )?;
        let rows = stmt.query_map([], memory_from_row)?.collect();
        rows
    })
}

/// Upsert a memory entry.
pub fn upsert(
    db: &Database,
    workspace_id: Option<&str>,
    key: &str,
    value: &str,
) -> Result<AgentMemory, String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let id = match workspace_id {
        Some(ws) => format!("mem-{ws}-{key}"),
        None => format!("mem-global-{key}"),
    };
    db.with_connection_mut(|connection| {
        connection.execute(
            r#"INSERT INTO agent_memory (id, workspace_id, key, value, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               ON CONFLICT(workspace_id, key) DO UPDATE SET
                   value = excluded.value,
                   updated_at = CURRENT_TIMESTAMP"#,
            params![id, workspace_id, key, value],
        )?;
        Ok(())
    })?;
    Ok(AgentMemory {
        id,
        workspace_id: workspace_id.map(str::to_string),
        key: key.to_string(),
        value: value.to_string(),
        created_at: ts.to_string(),
        updated_at: ts.to_string(),
    })
}

/// Delete a memory entry by workspace + key.
pub fn delete(db: &Database, workspace_id: Option<&str>, key: &str) -> Result<(), String> {
    db.with_connection_mut(|connection| {
        match workspace_id {
            Some(ws) => connection.execute(
                "DELETE FROM agent_memory WHERE workspace_id = ?1 AND key = ?2",
                params![ws, key],
            )?,
            None => connection.execute(
                "DELETE FROM agent_memory WHERE workspace_id IS NULL AND key = ?1",
                params![key],
            )?,
        };
        Ok(())
    })
}
