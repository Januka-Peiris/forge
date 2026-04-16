use std::time::{SystemTime, UNIX_EPOCH};

use crate::models::WorkspacePrDraft;
use crate::repositories::{agent_run_repository, pr_draft_repository, workspace_repository};
use crate::services::{git_review_service, review_summary_service};
use crate::state::AppState;

pub fn get_workspace_pr_draft(
    state: &AppState,
    workspace_id: &str,
) -> Result<WorkspacePrDraft, String> {
    if let Some(draft) = pr_draft_repository::get(&state.db, workspace_id)? {
        return Ok(draft);
    }
    refresh_workspace_pr_draft(state, workspace_id)
}

pub fn refresh_workspace_pr_draft(
    state: &AppState,
    workspace_id: &str,
) -> Result<WorkspacePrDraft, String> {
    let workspace = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let changed_files =
        git_review_service::get_workspace_changed_files(state, workspace_id).unwrap_or_default();
    let review_summary =
        review_summary_service::refresh_workspace_review_summary(state, workspace_id).ok();
    let latest_run = agent_run_repository::list_runs_for_workspace(&state.db, workspace_id)?
        .into_iter()
        .next();

    let title = format!("{}", workspace.summary.name.trim())
        .trim()
        .to_string();
    let title = if title.is_empty() {
        format!("Update {}", workspace.summary.repo)
    } else {
        title
    };

    let task_context = workspace.summary.current_task.trim();
    let summary = review_summary
        .as_ref()
        .map(|summary| {
            if task_context.is_empty() {
                summary.summary.clone()
            } else {
                format!(
                    "{}

Workspace task: {}",
                    summary.summary, task_context
                )
            }
        })
        .unwrap_or_else(|| {
            let task_sentence = if task_context.is_empty() {
                String::new()
            } else {
                format!(" Task context: {task_context}.")
            };
            format!(
                "Updates {} on branch {}. {} changed file(s) detected.{}",
                workspace.summary.repo,
                workspace.summary.branch,
                changed_files.len(),
                task_sentence,
            )
        });

    let mut key_changes = changed_files
        .iter()
        .take(8)
        .map(|file| {
            let churn = match (file.additions, file.deletions) {
                (Some(a), Some(d)) => format!(" (+{a} -{d})"),
                _ => String::new(),
            };
            format!("{} {}{}", file.status, file.path, churn)
        })
        .collect::<Vec<_>>();
    if key_changes.is_empty() {
        key_changes.push("No local git changes detected yet.".to_string());
    }

    let mut risks = review_summary
        .as_ref()
        .map(|summary| {
            summary
                .risk_reasons
                .iter()
                .take(6)
                .cloned()
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if risks.is_empty() {
        risks.push("No specific risks flagged by local deterministic review.".to_string());
    }

    let mut testing_notes = Vec::new();
    match latest_run.as_ref().map(|run| run.status.as_str()) {
        Some("succeeded") => {
            testing_notes.push("Latest Forge agent run completed successfully.".to_string())
        }
        Some("failed") => testing_notes
            .push("Latest Forge agent run failed; review logs before merging.".to_string()),
        Some("running") => testing_notes.push("A Forge agent run is still running.".to_string()),
        Some(status) => testing_notes.push(format!("Latest Forge agent run status: {status}.")),
        None => testing_notes.push(
            "No Forge agent run recorded. Add manual testing notes before opening PR.".to_string(),
        ),
    }
    testing_notes
        .push("Review the changed files and diff in Forge before creating a PR.".to_string());

    let draft = WorkspacePrDraft {
        workspace_id: workspace_id.to_string(),
        title,
        summary,
        key_changes,
        risks,
        testing_notes,
        generated_at: timestamp(),
    };
    pr_draft_repository::upsert(&state.db, &draft)?;
    Ok(draft)
}

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}
