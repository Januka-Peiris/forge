use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use serde_json::Value;

use crate::models::{
    AgentPromptEntry, MarkWorkspaceFileReviewedInput, QueueAgentPromptInput,
    QueueReviewAgentPromptInput, ReviewCockpitFile, WorkspacePrComment, WorkspaceReviewCockpit,
};
use crate::repositories::{review_cockpit_repository, workspace_repository};
use crate::services::{
    agent_context_service, git_review_service, merge_readiness_service, review_summary_service,
    terminal_service,
};
use crate::state::AppState;

pub fn get_workspace_review_cockpit(
    state: &AppState,
    workspace_id: &str,
) -> Result<WorkspaceReviewCockpit, String> {
    build_cockpit(state, workspace_id, None, false)
}

pub fn refresh_workspace_review_cockpit(
    state: &AppState,
    workspace_id: &str,
) -> Result<WorkspaceReviewCockpit, String> {
    build_cockpit(state, workspace_id, None, true)
}

pub fn get_workspace_review_cockpit_for_path(
    state: &AppState,
    workspace_id: &str,
    path: Option<&str>,
) -> Result<WorkspaceReviewCockpit, String> {
    build_cockpit(state, workspace_id, path, false)
}

pub fn mark_workspace_file_reviewed(
    state: &AppState,
    input: MarkWorkspaceFileReviewedInput,
) -> Result<WorkspaceReviewCockpit, String> {
    workspace_repository::get_detail(&state.db, &input.workspace_id)?
        .ok_or_else(|| format!("Workspace {} was not found", input.workspace_id))?;
    review_cockpit_repository::set_file_reviewed(
        &state.db,
        &input.workspace_id,
        &input.path,
        input.reviewed,
        &timestamp(),
        input.notes.as_deref(),
    )?;
    build_cockpit(state, &input.workspace_id, Some(&input.path), false)
}

pub fn refresh_workspace_pr_comments(
    state: &AppState,
    workspace_id: &str,
) -> Result<WorkspaceReviewCockpit, String> {
    let mut cockpit = build_cockpit(state, workspace_id, None, false)?;
    match fetch_github_pr_comments(state, workspace_id) {
        Ok((comments, warning)) => {
            review_cockpit_repository::upsert_pr_comments(&state.db, workspace_id, &comments)?;
            cockpit.pr_comments =
                review_cockpit_repository::list_pr_comments(&state.db, workspace_id)?;
            if let Some(warning) = warning {
                cockpit.warnings.push(warning);
            }
        }
        Err(err) => cockpit.warnings.push(err),
    }
    Ok(cockpit)
}

pub fn mark_workspace_pr_comment_resolved_local(
    state: &AppState,
    workspace_id: &str,
    comment_id: &str,
) -> Result<WorkspaceReviewCockpit, String> {
    review_cockpit_repository::mark_pr_comment_resolved_local(
        &state.db,
        workspace_id,
        comment_id,
        &timestamp(),
    )?;
    build_cockpit(state, workspace_id, None, false)
}

pub fn queue_review_agent_prompt(
    state: &AppState,
    input: QueueReviewAgentPromptInput,
) -> Result<AgentPromptEntry, String> {
    let prompt = build_review_prompt(state, &input)?;
    terminal_service::queue_workspace_agent_prompt(
        state,
        QueueAgentPromptInput {
            workspace_id: input.workspace_id,
            prompt,
            profile: None,
            profile_id: input.profile_id,
            task_mode: input.task_mode,
            reasoning: input.reasoning,
            mode: input.mode,
        },
    )
}

fn build_cockpit(
    state: &AppState,
    workspace_id: &str,
    selected_path: Option<&str>,
    refresh: bool,
) -> Result<WorkspaceReviewCockpit, String> {
    let started = Instant::now();
    workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let changed_files = git_review_service::get_workspace_changed_files(state, workspace_id)?;
    let review_states =
        review_cockpit_repository::list_file_review_states(&state.db, workspace_id)?;
    let by_path = review_states
        .into_iter()
        .map(|state| (state.path.clone(), state))
        .collect::<HashMap<_, _>>();
    let files = changed_files
        .iter()
        .cloned()
        .map(|file| ReviewCockpitFile {
            review: by_path.get(&file.path).cloned(),
            file,
        })
        .collect::<Vec<_>>();
    let selected = selected_path
        .map(str::to_string)
        .or_else(|| changed_files.first().map(|file| file.path.clone()));
    let selected_diff = selected.as_deref().and_then(|path| {
        git_review_service::get_workspace_file_diff(state, workspace_id, path).ok()
    });
    let review_summary = if refresh {
        review_summary_service::refresh_workspace_review_summary(state, workspace_id).ok()
    } else {
        review_summary_service::get_workspace_review_summary(state, workspace_id).ok()
    };
    let merge_readiness = if refresh {
        merge_readiness_service::refresh_workspace_merge_readiness(state, workspace_id).ok()
    } else {
        merge_readiness_service::get_workspace_merge_readiness(state, workspace_id).ok()
    };
    let pr_comments = review_cockpit_repository::list_pr_comments(&state.db, workspace_id)?;
    let cockpit = WorkspaceReviewCockpit {
        workspace_id: workspace_id.to_string(),
        files,
        selected_diff,
        review_summary,
        merge_readiness,
        pr_comments,
        warnings: Vec::new(),
    };
    log::debug!(
        target: "forge_lib",
        "build_review_cockpit workspace={} files={} comments={} refresh={} elapsed_ms={}",
        workspace_id,
        cockpit.files.len(),
        cockpit.pr_comments.len(),
        refresh,
        started.elapsed().as_millis()
    );
    Ok(cockpit)
}

fn fetch_github_pr_comments(
    state: &AppState,
    workspace_id: &str,
) -> Result<(Vec<WorkspacePrComment>, Option<String>), String> {
    let root = workspace_root(state, workspace_id)?;
    let gh = find_gh_binary()?;
    let auth = Command::new(&gh).args(["auth", "status"]).output();
    if !auth.map(|output| output.status.success()).unwrap_or(false) {
        return Ok((
            Vec::new(),
            Some("GitHub CLI is not authenticated. Run: gh auth login".to_string()),
        ));
    }

    let pr_output = Command::new(&gh)
        .current_dir(&root)
        .args(["pr", "view", "--json", "number,url,comments,reviews"])
        .output()
        .map_err(|err| format!("Failed to run gh pr view: {err}"))?;
    if !pr_output.status.success() {
        return Ok((
            Vec::new(),
            Some("No GitHub PR found for this branch.".to_string()),
        ));
    }
    let pr_json = String::from_utf8_lossy(&pr_output.stdout);
    let value = serde_json::from_str::<Value>(&pr_json)
        .map_err(|err| format!("Failed to parse gh pr view output: {err}"))?;
    let number = value.get("number").and_then(Value::as_i64).unwrap_or(0);
    let mut comments = parse_pr_view_comments(workspace_id, &value);

    if number > 0 {
        if let Some((owner, repo)) = git_remote_owner_repo(&root) {
            let endpoint = format!("repos/{owner}/{repo}/pulls/{number}/comments");
            let output = Command::new(&gh)
                .current_dir(&root)
                .args(["api", &endpoint])
                .output()
                .map_err(|err| format!("Failed to run gh api for PR comments: {err}"))?;
            if output.status.success() {
                let json = String::from_utf8_lossy(&output.stdout);
                if let Ok(value) = serde_json::from_str::<Value>(&json) {
                    comments.extend(parse_inline_comments(workspace_id, &value));
                }
            }
        }
    }
    dedupe_comments(&mut comments);
    Ok((comments, None))
}

pub fn parse_pr_view_comments(workspace_id: &str, value: &Value) -> Vec<WorkspacePrComment> {
    let mut comments = Vec::new();
    if let Some(items) = value.get("comments").and_then(Value::as_array) {
        for item in items {
            let id = item
                .get("id")
                .and_then(Value::as_str)
                .or_else(|| item.get("url").and_then(Value::as_str))
                .unwrap_or("comment");
            let author = item
                .get("author")
                .and_then(|author| author.get("login"))
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            let body = item.get("body").and_then(Value::as_str).unwrap_or("");
            if body.trim().is_empty() {
                continue;
            }
            comments.push(WorkspacePrComment {
                workspace_id: workspace_id.to_string(),
                provider: "github".to_string(),
                comment_id: format!("issue-{id}"),
                author: author.to_string(),
                body: body.to_string(),
                path: None,
                line: None,
                url: item.get("url").and_then(Value::as_str).map(str::to_string),
                state: "open".to_string(),
                created_at: item
                    .get("createdAt")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                resolved_at: None,
            });
        }
    }
    if let Some(items) = value.get("reviews").and_then(Value::as_array) {
        for item in items {
            let body = item.get("body").and_then(Value::as_str).unwrap_or("");
            if body.trim().is_empty() {
                continue;
            }
            let id = item
                .get("id")
                .and_then(Value::as_str)
                .or_else(|| item.get("url").and_then(Value::as_str))
                .unwrap_or("review");
            let author = item
                .get("author")
                .and_then(|author| author.get("login"))
                .and_then(Value::as_str)
                .unwrap_or("unknown");
            comments.push(WorkspacePrComment {
                workspace_id: workspace_id.to_string(),
                provider: "github".to_string(),
                comment_id: format!("review-{id}"),
                author: author.to_string(),
                body: body.to_string(),
                path: None,
                line: None,
                url: item.get("url").and_then(Value::as_str).map(str::to_string),
                state: "open".to_string(),
                created_at: item
                    .get("submittedAt")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                resolved_at: None,
            });
        }
    }
    comments
}

pub fn parse_inline_comments(workspace_id: &str, value: &Value) -> Vec<WorkspacePrComment> {
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let body = item.get("body")?.as_str()?.to_string();
            if body.trim().is_empty() {
                return None;
            }
            let id = item
                .get("id")
                .and_then(Value::as_i64)
                .map(|id| id.to_string())
                .or_else(|| {
                    item.get("node_id")
                        .and_then(Value::as_str)
                        .map(str::to_string)
                })
                .unwrap_or_else(|| format!("inline-{}", body.len()));
            Some(WorkspacePrComment {
                workspace_id: workspace_id.to_string(),
                provider: "github".to_string(),
                comment_id: format!("inline-{id}"),
                author: item
                    .get("user")
                    .and_then(|user| user.get("login"))
                    .and_then(Value::as_str)
                    .unwrap_or("unknown")
                    .to_string(),
                body,
                path: item.get("path").and_then(Value::as_str).map(str::to_string),
                line: item
                    .get("line")
                    .or_else(|| item.get("original_line"))
                    .and_then(Value::as_u64)
                    .map(|line| line as u32),
                url: item
                    .get("html_url")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                state: "open".to_string(),
                created_at: item
                    .get("created_at")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                resolved_at: None,
            })
        })
        .collect()
}

fn dedupe_comments(comments: &mut Vec<WorkspacePrComment>) {
    let mut seen = std::collections::HashSet::new();
    comments.retain(|comment| seen.insert(comment.comment_id.clone()));
}

fn build_review_prompt(
    state: &AppState,
    input: &QueueReviewAgentPromptInput,
) -> Result<String, String> {
    let detail = workspace_repository::get_detail(&state.db, &input.workspace_id)?
        .ok_or_else(|| format!("Workspace {} was not found", input.workspace_id))?;
    let root = detail
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or(detail.worktree_path);
    let mut sections = Vec::new();
    sections.push("Forge review task".to_string());
    sections.push(format!("Primary writable workspace: {root}"));
    if let Ok(context) =
        agent_context_service::get_workspace_agent_context(state, &input.workspace_id)
    {
        if !context.prompt_preamble.trim().is_empty() {
            sections.push(context.prompt_preamble);
        }
    }
    sections.push("Modify only the primary writable workspace unless I explicitly ask you to edit linked repositories.".to_string());
    sections.push(match input.action.as_str() {
        "fix_file" => "Task: fix the selected file based on the diff below.".to_string(),
        "explain_diff" => "Task: explain the selected diff and call out review risks. Do not edit files unless necessary.".to_string(),
        "address_comment" => "Task: address the selected PR review comment.".to_string(),
        "prepare_pr_summary" => "Task: prepare a concise PR summary from the accepted/reviewed files and current diff.".to_string(),
        other => format!("Task: {other}"),
    });
    if let Some(path) = input.path.as_deref() {
        sections.push(format!("Selected file: {path}"));
        if let Ok(diff) =
            git_review_service::get_workspace_file_diff(state, &input.workspace_id, path)
        {
            sections.push(format!(
                "Diff:\n```diff\n{}\n```",
                truncate(&diff.diff, 20000)
            ));
        }
    }
    if let Some(comment_id) = input.comment_id.as_deref() {
        if let Some(comment) =
            review_cockpit_repository::get_pr_comment(&state.db, &input.workspace_id, comment_id)?
        {
            sections.push(format!(
                "PR comment from {}{}:\n{}",
                comment.author,
                comment
                    .path
                    .as_deref()
                    .map(|path| format!(
                        " on {path}{}",
                        comment
                            .line
                            .map(|line| format!(":{line}"))
                            .unwrap_or_default()
                    ))
                    .unwrap_or_default(),
                truncate(&comment.body, 12000)
            ));
        }
    }
    Ok(sections.join("\n\n"))
}

fn truncate(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        value.to_string()
    } else {
        format!(
            "{}\n...[truncated]",
            value.chars().take(max_chars).collect::<String>()
        )
    }
}

fn workspace_root(state: &AppState, workspace_id: &str) -> Result<PathBuf, String> {
    let detail = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let root = detail
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or(detail.worktree_path);
    Ok(PathBuf::from(root))
}

fn find_gh_binary() -> Result<String, String> {
    for candidate in ["gh", "/opt/homebrew/bin/gh", "/usr/local/bin/gh"] {
        if Command::new(candidate)
            .arg("--version")
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false)
        {
            return Ok(candidate.to_string());
        }
    }
    Err("GitHub CLI is required for PR comments. Install with: brew install gh".to_string())
}

fn git_remote_owner_repo(root: &Path) -> Option<(String, String)> {
    let output = Command::new("git")
        .arg("-C")
        .arg(root)
        .args(["remote", "get-url", "origin"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    parse_github_remote(String::from_utf8_lossy(&output.stdout).trim())
}

fn parse_github_remote(remote: &str) -> Option<(String, String)> {
    let trimmed = remote.trim().trim_end_matches(".git");
    if let Some(rest) = trimmed.strip_prefix("git@github.com:") {
        let (owner, repo) = rest.split_once('/')?;
        return Some((owner.to_string(), repo.to_string()));
    }
    if let Some(rest) = trimmed.strip_prefix("https://github.com/") {
        let (owner, repo) = rest.split_once('/')?;
        return Some((owner.to_string(), repo.to_string()));
    }
    None
}

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_inline_github_comments() {
        let value = serde_json::json!([{
            "id": 42,
            "body": "Please fix this",
            "path": "src/lib.rs",
            "line": 12,
            "html_url": "https://example.test/comment",
            "created_at": "now",
            "user": { "login": "greptile" }
        }]);
        let comments = parse_inline_comments("ws", &value);
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].path.as_deref(), Some("src/lib.rs"));
        assert_eq!(comments[0].line, Some(12));
        assert_eq!(comments[0].author, "greptile");
    }

    #[test]
    fn parses_issue_and_review_comments() {
        let value = serde_json::json!({
            "comments": [{ "id": "c1", "body": "general", "author": { "login": "alice" }, "url": "u", "createdAt": "t" }],
            "reviews": [{ "id": "r1", "body": "review", "author": { "login": "bot" }, "url": "r", "submittedAt": "t" }]
        });
        let comments = parse_pr_view_comments("ws", &value);
        assert_eq!(comments.len(), 2);
        assert!(comments.iter().any(|comment| comment.author == "alice"));
        assert!(comments.iter().any(|comment| comment.author == "bot"));
    }

    #[test]
    fn parses_github_remotes() {
        assert_eq!(
            parse_github_remote("git@github.com:owner/repo.git"),
            Some(("owner".to_string(), "repo".to_string()))
        );
        assert_eq!(
            parse_github_remote("https://github.com/owner/repo.git"),
            Some(("owner".to_string(), "repo".to_string()))
        );
    }
}
