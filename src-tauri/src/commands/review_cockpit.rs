use tauri::State;

use crate::commands::perf::measure_command;
use crate::models::{
    AgentPromptEntry, MarkWorkspaceFileReviewedInput, QueueReviewAgentPromptInput,
    WorkspaceReviewCockpit,
};
use crate::services::review_cockpit_service;
use crate::state::AppState;

#[tauri::command]
pub fn get_workspace_review_cockpit(
    state: State<'_, AppState>,
    workspace_id: String,
    selected_path: Option<String>,
) -> Result<WorkspaceReviewCockpit, String> {
    measure_command("get_workspace_review_cockpit", || {
        if selected_path.is_some() {
            review_cockpit_service::get_workspace_review_cockpit_for_path(
                &state,
                &workspace_id,
                selected_path.as_deref(),
            )
        } else {
            review_cockpit_service::get_workspace_review_cockpit(&state, &workspace_id)
        }
    })
}

#[tauri::command]
pub fn refresh_workspace_review_cockpit(
    state: State<'_, AppState>,
    workspace_id: String,
    selected_path: Option<String>,
) -> Result<WorkspaceReviewCockpit, String> {
    measure_command("refresh_workspace_review_cockpit", || {
        let mut cockpit =
            review_cockpit_service::refresh_workspace_review_cockpit(&state, &workspace_id)?;
        if selected_path.is_some() {
            cockpit = review_cockpit_service::get_workspace_review_cockpit_for_path(
                &state,
                &workspace_id,
                selected_path.as_deref(),
            )?;
        }
        Ok(cockpit)
    })
}

#[tauri::command]
pub fn mark_workspace_file_reviewed(
    state: State<'_, AppState>,
    input: MarkWorkspaceFileReviewedInput,
) -> Result<WorkspaceReviewCockpit, String> {
    measure_command("mark_workspace_file_reviewed", || {
        review_cockpit_service::mark_workspace_file_reviewed(&state, input)
    })
}

#[tauri::command]
pub fn refresh_workspace_pr_comments(
    state: State<'_, AppState>,
    workspace_id: String,
) -> Result<WorkspaceReviewCockpit, String> {
    measure_command("refresh_workspace_pr_comments", || {
        review_cockpit_service::refresh_workspace_pr_comments(&state, &workspace_id)
    })
}

#[tauri::command]
pub fn mark_workspace_pr_comment_resolved_local(
    state: State<'_, AppState>,
    workspace_id: String,
    comment_id: String,
) -> Result<WorkspaceReviewCockpit, String> {
    review_cockpit_service::mark_workspace_pr_comment_resolved_local(
        &state,
        &workspace_id,
        &comment_id,
    )
}

#[tauri::command]
pub fn queue_review_agent_prompt(
    state: State<'_, AppState>,
    input: QueueReviewAgentPromptInput,
) -> Result<AgentPromptEntry, String> {
    measure_command("queue_review_agent_prompt", || {
        review_cockpit_service::queue_review_agent_prompt(&state, input)
    })
}
