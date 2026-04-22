use rusqlite::params;

use crate::db::Database;
use crate::models::AgentMemory;

fn memory_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AgentMemory> {
    Ok(AgentMemory {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        scope: row
            .get::<_, Option<String>>("scope")?
            .unwrap_or_else(|| "global".to_string()),
        key: row.get("key")?,
        value: row.get("value")?,
        origin: row
            .get::<_, Option<String>>("origin")?
            .unwrap_or_else(|| "manual".to_string()),
        confidence: row.get::<_, Option<f64>>("confidence")?.unwrap_or(1.0),
        source_task_run_id: row.get("source_task_run_id")?,
        last_used_at: row.get("last_used_at")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

/// List memory entries for a specific workspace.
pub fn list_for_workspace(db: &Database, workspace_id: &str) -> Result<Vec<AgentMemory>, String> {
    db.with_connection(|connection| {
        let mut stmt = connection.prepare(
            "SELECT id, workspace_id, scope, key, value, origin, confidence, source_task_run_id, last_used_at, created_at, updated_at
             FROM agent_memory WHERE workspace_id = ?1 ORDER BY key ASC",
        )?;
        let rows = stmt
            .query_map(params![workspace_id], memory_from_row)?
            .collect();
        rows
    })
}

/// List all memory entries (global + all workspaces).
pub fn list_all(db: &Database) -> Result<Vec<AgentMemory>, String> {
    db.with_connection(|connection| {
        let mut stmt = connection.prepare(
            "SELECT id, workspace_id, scope, key, value, origin, confidence, source_task_run_id, last_used_at, created_at, updated_at
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
    scope: Option<&str>,
    key: &str,
    value: &str,
    origin: Option<&str>,
    confidence: Option<f64>,
    source_task_run_id: Option<&str>,
    last_used_at: Option<&str>,
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
    let scope_value = scope.unwrap_or(if workspace_id.is_some() {
        "workspace"
    } else {
        "global"
    });
    let origin_value = origin.unwrap_or("manual");
    let confidence_value = confidence.unwrap_or(1.0);
    db.with_connection_mut(|connection| {
        connection.execute(
            r#"INSERT INTO agent_memory (id, workspace_id, scope, key, value, origin, confidence, source_task_run_id, last_used_at, created_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
               ON CONFLICT(workspace_id, key) DO UPDATE SET
                   scope = excluded.scope,
                   value = excluded.value,
                   origin = excluded.origin,
                   confidence = excluded.confidence,
                   source_task_run_id = excluded.source_task_run_id,
                   last_used_at = excluded.last_used_at,
                   updated_at = CURRENT_TIMESTAMP"#,
            params![
                id,
                workspace_id,
                scope_value,
                key,
                value,
                origin_value,
                confidence_value,
                source_task_run_id,
                last_used_at
            ],
        )?;
        Ok(())
    })?;
    Ok(AgentMemory {
        id,
        workspace_id: workspace_id.map(str::to_string),
        scope: scope_value.to_string(),
        key: key.to_string(),
        value: value.to_string(),
        origin: origin_value.to_string(),
        confidence: confidence_value,
        source_task_run_id: source_task_run_id.map(str::to_string),
        last_used_at: last_used_at.map(str::to_string),
        created_at: ts.to_string(),
        updated_at: ts.to_string(),
    })
}

pub fn list_relevant_for_prompt(
    db: &Database,
    workspace_id: &str,
    prompt: &str,
    limit: usize,
) -> Result<Vec<AgentMemory>, String> {
    let needle = prompt.to_lowercase();
    let mut all = list_all(db)?;
    all.retain(|entry| {
        let key_match = entry
            .key
            .to_lowercase()
            .split(|ch: char| !ch.is_alphanumeric())
            .filter(|part| !part.is_empty())
            .any(|part| needle.contains(part));
        let value_match = entry
            .value
            .to_lowercase()
            .split(|ch: char| !ch.is_alphanumeric())
            .filter(|part| part.len() >= 4)
            .take(12)
            .any(|part| needle.contains(part));
        (entry.workspace_id.as_deref() == Some(workspace_id) || entry.workspace_id.is_none())
            && (key_match || value_match)
    });
    all.sort_by_key(|entry| {
        if entry.workspace_id.as_deref() == Some(workspace_id) {
            0usize
        } else {
            1usize
        }
    });
    all.truncate(limit);
    Ok(all)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn metadata_upsert_and_relevant_lookup_work() {
        let db = crate::db::Database::in_memory().expect("in-memory db");
        let workspace = "ws-lookup";
        db.with_connection_mut(|connection| {
            connection.execute(
                "INSERT INTO workspaces (
                    id, name, repo, branch, agent, status, current_step, completed_steps, last_updated,
                    description, current_task, merge_risk, last_rebase, base_branch, agent_session_id,
                    agent_session_agent, agent_session_status, agent_session_model, agent_session_estimated_cost,
                    agent_session_last_message, agent_session_started_at, worktree_path
                ) VALUES (?1, 'W', 'repo', 'main', 'shell', 'active', 'none', '[]', '0', 'd', 't', 'Low', '0', 'main', 's', 'shell', 'idle', 'none', '0', '', '0', '.')",
                [workspace],
            )?;
            Ok(())
        }).expect("seed workspace");

        let _ = upsert(
            &db,
            Some(workspace),
            Some("workspace"),
            "env-pattern",
            "Use pnpm install before tests",
            Some("auto"),
            Some(0.7),
            Some("task-1"),
            Some("200"),
        )
        .expect("upsert");

        let relevant =
            list_relevant_for_prompt(&db, workspace, "please run tests after pnpm install", 5)
                .expect("relevant");
        assert_eq!(relevant.len(), 1);
        assert_eq!(relevant[0].origin, "auto");
        assert_eq!(relevant[0].scope, "workspace");
        assert_eq!(relevant[0].source_task_run_id.as_deref(), Some("task-1"));
    }
}
