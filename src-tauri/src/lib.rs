mod commands;
mod db;
mod models;
mod repositories;
mod services;
mod state;

use commands::{
    activity, agent_context, agent_profiles, agent_runs, deep_links, environment, git_review,
    merge_readiness, pr_draft, prompt_templates, repositories as repository_commands,
    review_cockpit, review_summary, reviews, settings, terminal, workspace_attention,
    workspace_cleanup, workspace_health, workspace_ports, workspace_readiness, workspace_scripts,
    workspaces,
};
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = env_logger::Builder::from_env(
        env_logger::Env::default().default_filter_or("forge_lib=info,info"),
    )
    .format_timestamp_secs()
    .try_init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state =
                AppState::initialize(app.handle()).map_err(Box::<dyn std::error::Error>::from)?;
            log::info!(target: "forge_lib", "SQLite database path: {}", state.db.path().display());
            println!("Forge SQLite database: {}", state.db.path().display());
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            workspaces::list_workspaces,
            workspaces::get_workspace_detail,
            workspaces::create_workspace,
            workspaces::create_child_workspace,
            workspaces::open_in_cursor,
            workspaces::open_worktree_in_cursor,
            workspaces::delete_workspace,
            workspaces::attach_workspace_linked_worktree,
            workspaces::list_workspace_linked_worktrees,
            workspaces::detach_workspace_linked_worktree,
            workspaces::list_repositories_for_workspace_creation,
            workspaces::get_repository_workspace_options,
            reviews::list_pending_reviews,
            review_cockpit::get_workspace_review_cockpit,
            review_cockpit::refresh_workspace_review_cockpit,
            review_cockpit::mark_workspace_file_reviewed,
            review_cockpit::refresh_workspace_pr_comments,
            review_cockpit::mark_workspace_pr_comment_resolved_local,
            review_cockpit::queue_review_agent_prompt,
            activity::list_activity,
            settings::get_settings,
            settings::save_repo_roots,
            settings::save_has_completed_env_check,
            settings::resolve_git_repository_path,
            agent_context::get_workspace_agent_context,
            agent_context::get_workspace_context_preview,
            agent_context::refresh_workspace_repo_context,
            agent_profiles::list_workspace_agent_profiles,
            deep_links::open_deep_link,
            environment::check_environment,
            repository_commands::scan_repositories,
            repository_commands::remove_repository,
            agent_runs::start_workspace_run,
            agent_runs::stop_workspace_run,
            agent_runs::get_workspace_runs,
            agent_runs::get_workspace_run_logs,
            git_review::get_workspace_changed_files,
            git_review::get_workspace_file_diff,
            review_summary::get_workspace_review_summary,
            review_summary::refresh_workspace_review_summary,
            merge_readiness::get_workspace_merge_readiness,
            merge_readiness::refresh_workspace_merge_readiness,
            pr_draft::get_workspace_pr_draft,
            pr_draft::refresh_workspace_pr_draft,
            prompt_templates::list_workspace_prompt_templates,
            terminal::create_workspace_terminal,
            terminal::attach_workspace_terminal_session,
            terminal::write_workspace_terminal_session_input,
            terminal::resize_workspace_terminal_session,
            terminal::interrupt_workspace_terminal_session_by_id,
            terminal::stop_workspace_terminal_session_by_id,
            terminal::close_workspace_terminal_session_by_id,
            terminal::list_workspace_visible_terminal_sessions,
            terminal::capture_workspace_terminal_scrollback,
            terminal::start_workspace_terminal_session,
            terminal::write_workspace_terminal_input,
            terminal::resize_workspace_terminal,
            terminal::stop_workspace_terminal_session,
            terminal::interrupt_workspace_terminal_session,
            terminal::close_workspace_terminal_session,
            terminal::get_workspace_terminal_session_state,
            terminal::get_workspace_terminal_output,
            terminal::get_workspace_terminal_output_for_session,
            terminal::list_workspace_terminal_sessions,
            terminal::reconnect_workspace_terminal_session,
            terminal::queue_workspace_agent_prompt,
            terminal::run_next_workspace_agent_prompt,
            terminal::list_workspace_agent_prompts,
            terminal::write_workspace_utility_terminal_input,
            terminal::resize_workspace_utility_terminal,
            terminal::stop_workspace_utility_terminal_session,
            terminal::get_workspace_utility_terminal_session_state,
            terminal::get_workspace_utility_terminal_output,
            terminal::reconnect_workspace_utility_terminal_session,
            workspace_attention::list_workspace_attention,
            workspace_attention::mark_workspace_attention_read,
            workspace_health::get_workspace_health,
            workspace_readiness::get_workspace_readiness,
            workspace_cleanup::cleanup_workspace,
            workspace_ports::list_workspace_ports,
            workspace_ports::open_workspace_port,
            workspace_ports::kill_workspace_port_process,
            workspace_scripts::get_workspace_forge_config,
            workspace_scripts::run_workspace_setup,
            workspace_scripts::start_workspace_run_command,
            workspace_scripts::restart_workspace_run_command,
            workspace_scripts::stop_workspace_run_commands,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Forge Tauri application");
}
