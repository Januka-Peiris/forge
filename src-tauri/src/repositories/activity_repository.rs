use rusqlite::params;

use crate::db::Database;
use crate::models::ActivityItem;

pub fn list(db: &Database) -> Result<Vec<ActivityItem>, String> {
    db.with_connection(|connection| {
        let mut statement = connection.prepare(
            r#"
            SELECT id, workspace_id, repo, branch, event, level, details, timestamp
            FROM activity_items
            ORDER BY rowid DESC
            "#,
        )?;

        let items = statement
            .query_map([], |row| {
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
            })?
            .collect();

        items
    })
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
