use crate::models::{AgentContextWorktree, WorkspaceAgentContext};
use crate::repositories::workspace_repository;
use crate::state::AppState;

pub fn get_workspace_agent_context(
    state: &AppState,
    workspace_id: &str,
) -> Result<WorkspaceAgentContext, String> {
    let workspace = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let primary_path = workspace
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let linked_worktrees =
        workspace_repository::list_linked_worktrees_for_workspace(&state.db, workspace_id)?
            .into_iter()
            .map(|linked| AgentContextWorktree {
                repo_id: linked.repo_id,
                repo_name: linked.repo_name,
                path: linked.path,
                branch: linked.branch,
                head: linked.head,
            })
            .collect::<Vec<_>>();
    let prompt_preamble = format_prompt_preamble(&primary_path, &linked_worktrees);
    Ok(WorkspaceAgentContext {
        workspace_id: workspace_id.to_string(),
        primary_path,
        linked_worktrees,
        prompt_preamble,
    })
}

pub fn format_prompt_preamble(primary_path: &str, linked: &[AgentContextWorktree]) -> String {
    if linked.is_empty() {
        return String::new();
    }
    let mut lines = vec![
        "Forge linked repository context:".to_string(),
        format!("- Primary writable workspace: {primary_path}"),
        "- Linked repositories are read-only context unless the user explicitly asks to edit them:"
            .to_string(),
    ];
    for item in linked {
        let branch = item.branch.as_deref().unwrap_or("detached");
        lines.push(format!("  - {} ({branch}): {}", item.repo_name, item.path));
    }
    lines.push("Use these paths for cross-repo understanding and mention before making assumptions across repos.".to_string());
    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_linked_context_has_no_preamble() {
        assert_eq!(format_prompt_preamble("/tmp/app", &[]), "");
    }

    #[test]
    fn formats_linked_context_as_read_only() {
        let preamble = format_prompt_preamble(
            "/tmp/frontend",
            &[AgentContextWorktree {
                repo_id: "repo-backend".to_string(),
                repo_name: "backend".to_string(),
                path: "/tmp/backend".to_string(),
                branch: Some("main".to_string()),
                head: None,
            }],
        );
        assert!(preamble.contains("Primary writable workspace: /tmp/frontend"));
        assert!(preamble.contains("backend (main): /tmp/backend"));
        assert!(preamble.contains("read-only context"));
    }
}
