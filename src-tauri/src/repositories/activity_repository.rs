use rusqlite::params;

use crate::db::Database;
use crate::models::ActivityItem;

fn item_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActivityItem> {
    Ok(ActivityItem {
        id: row.get("id")?,
        workspace_id: row.get("workspace_id")?,
        repo: row.get("repo")?,
        branch: row.get("branch")?,
        event: row.get("event")?,
        level: row.get("level")?,
        details: row.get("details")?,
        timestamp: row.get("timestamp")?,
    })
}

pub fn list(db: &Database) -> Result<Vec<ActivityItem>, String> {
    db.with_connection(|connection| {
        let mut statement = connection.prepare(
            "SELECT id, workspace_id, repo, branch, event, level, details, timestamp
             FROM activity_items ORDER BY rowid DESC",
        )?;
        let items = statement.query_map([], item_from_row)?.collect();
        items
    })
}

pub fn list_for_workspace(
    db: &Database,
    workspace_id: &str,
    limit: u32,
) -> Result<Vec<ActivityItem>, String> {
    db.with_connection(|connection| {
        let mut statement = connection.prepare(
            "SELECT id, workspace_id, repo, branch, event, level, details, timestamp
             FROM activity_items WHERE workspace_id = ?1
             ORDER BY rowid DESC LIMIT ?2",
        )?;
        let items = statement
            .query_map(params![workspace_id, limit], item_from_row)?
            .collect();
        items
    })
}

pub fn record(
    db: &Database,
    workspace_id: &str,
    repo: &str,
    branch: Option<&str>,
    event: &str,
    level: &str,
    details: Option<&str>,
) -> Result<(), String> {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Unique enough for our insert-or-replace
    let id = format!("act-{workspace_id}-{ts}");
    insert(
        db,
        &ActivityItem {
            id,
            workspace_id: Some(workspace_id.to_string()),
            repo: repo.to_string(),
            branch: branch.map(str::to_string),
            event: event.to_string(),
            level: level.to_string(),
            details: details.map(str::to_string),
            timestamp: ts.to_string(),
        },
    )
}

pub fn insert(db: &Database, item: &ActivityItem) -> Result<(), String> {
    db.with_connection(|connection| {
        connection.execute(
            r#"
            INSERT OR REPLACE INTO activity_items (
                id, workspace_id, repo, branch, event, level, details, timestamp
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                item.id,
                item.workspace_id,
                item.repo,
                item.branch,
                item.event,
                item.level,
                item.details,
                item.timestamp,
            ],
        )?;
        Ok(())
    })
}

#[allow(dead_code)]
pub fn seed(db: &Database, items: &[ActivityItem]) -> Result<(), String> {
    db.with_connection_mut(|connection| {
        let transaction = connection.transaction()?;
        for item in items {
            transaction.execute(
                r#"
                INSERT OR REPLACE INTO activity_items (
                    id, workspace_id, repo, branch, event, level, details, timestamp
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                "#,
                params![
                    item.id,
                    item.workspace_id,
                    item.repo,
                    item.branch,
                    item.event,
                    item.level,
                    item.details,
                    item.timestamp,
                ],
            )?;
        }
        transaction.commit()
    })
}
