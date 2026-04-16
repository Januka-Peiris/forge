use rusqlite::params;

use crate::db::Database;
use crate::models::ReviewItem;

pub fn list_pending(db: &Database) -> Result<Vec<ReviewItem>, String> {
    db.with_connection(|connection| {
        let mut statement = connection.prepare(
            r#"
            SELECT id, workspace_id, workspace_name, repo, branch, risk, files_changed,
                   additions, deletions, ai_summary, author, created_at_label
            FROM review_items
            ORDER BY rowid DESC
            "#,
        )?;

        let items = statement
            .query_map([], |row| {
                Ok(ReviewItem {
                    id: row.get("id")?,
                    workspace_id: row.get("workspace_id")?,
                    workspace_name: row.get("workspace_name")?,
                    repo: row.get("repo")?,
                    branch: row.get("branch")?,
                    risk: row.get("risk")?,
                    files_changed: row.get("files_changed")?,
                    additions: row.get("additions")?,
                    deletions: row.get("deletions")?,
                    ai_summary: row.get("ai_summary")?,
                    author: row.get("author")?,
                    created_at: row.get("created_at_label")?,
                })
            })?
            .collect();

        items
    })
}

#[allow(dead_code)]
pub fn seed(db: &Database, reviews: &[ReviewItem]) -> Result<(), String> {
    db.with_connection_mut(|connection| {
        let transaction = connection.transaction()?;
        for review in reviews {
            transaction.execute(
                r#"
                INSERT OR REPLACE INTO review_items (
                    id, workspace_id, workspace_name, repo, branch, risk, files_changed,
                    additions, deletions, ai_summary, author, created_at_label
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                "#,
                params![
                    review.id,
                    review.workspace_id,
                    review.workspace_name,
                    review.repo,
                    review.branch,
                    review.risk,
                    review.files_changed,
                    review.additions,
                    review.deletions,
                    review.ai_summary,
                    review.author,
                    review.created_at,
                ],
            )?;
        }
        transaction.commit()
    })
}
