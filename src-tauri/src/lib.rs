mod commands;
mod context;
mod db;
mod models;
mod repositories;
mod services;
mod state;

use std::sync::atomic::Ordering;

use commands::{
    activity, agent_chat, agent_context, agent_memory, agent_profiles, agent_runs, checkpoints,
    coordinator as coordinator_commands, deep_links, environment, git_review, local_llms,
    merge_readiness, orchestrator as orchestrator_commands, pr_draft, prompt_templates,
    repositories as repository_commands, review_cockpit, review_summary, reviews, settings,
    terminal, workspace_attention, workspace_cleanup, workspace_file_tree, workspace_health,
    workspace_ports, workspace_readiness, workspace_scripts, workspace_templates, workspaces,
};
use services::{coordinator_service, orchestrator_service, rebase_service};
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
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let state =
                AppState::initialize(app.handle()).map_err(Box::<dyn std::error::Error>::from)?;
            log::info!(target: "forge_lib", "SQLite database path: {}", state.db.path().display());
            println!("Forge SQLite database: {}", state.db.path().display());

            // Restore persisted orchestrator settings.
            if let Ok(Some(val)) = crate::repositories::orchestrator_repository::load_setting(
                &state.db,
                "orchestrator_enabled",
            ) {
                state
                    .orchestrator_enabled
                    .store(val == "true", Ordering::Relaxed);
            }
            if let Ok(Some(model)) = crate::repositories::orchestrator_repository::load_setting(
                &state.db,
                "orchestrator_model",
            ) {
                if let Ok(mut guard) = state.orchestrator_model.lock() {
                    *guard = model;
                }
            }
            if let Err(error) = coordinator_service::reconcile_all_active_runs_on_startup(&state) {
                log::warn!(target: "forge_lib", "Failed to reconcile active coordinator runs on startup: {error}");
            }

            rebase_service::start_auto_rebase_loop(state.clone());
            orchestrator_service::start_orchestrator_loop(state.clone());
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
            workspaces::pull_workspace_branch,
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
            review_cockpit::resolve_workspace_pr_thread,
            review_cockpit::reopen_workspace_pr_thread,
            review_cockpit::sync_workspace_pr_threads,
            review_cockpit::queue_review_agent_prompt,
            activity::list_activity,
            activity::list_workspace_activity,
            settings::get_settings,
            settings::save_repo_roots,
            settings::save_has_completed_env_check,
            settings::resolve_git_repository_path,
            settings::get_ai_model_settings,
            settings::save_ai_model_settings,
            settings::get_setting,
            settings::set_setting,
            agent_context::get_workspace_agent_context,
            agent_context::get_workspace_context_preview,
            agent_context::refresh_workspace_repo_context,
            agent_context::build_workspace_repo_context,
            agent_context::get_context_status,
            agent_context::get_context_preview_with_hint,
            agent_chat::create_agent_chat_session,
            agent_chat::send_agent_chat_message,
            agent_chat::list_agent_chat_sessions,
            agent_chat::list_agent_chat_events,
            agent_chat::interrupt_agent_chat_session,
            agent_chat::close_agent_chat_session,
            agent_profiles::list_workspace_agent_profiles,
            agent_profiles::list_app_agent_profiles,
            agent_profiles::save_app_agent_profiles,
            deep_links::open_deep_link,
            environment::check_environment,
            local_llms::list_local_llm_models,
            local_llms::diagnose_local_llm_profile,
            repository_commands::scan_repositories,
            repository_commands::remove_repository,
            repository_commands::add_repository,
            repository_commands::list_repositories,
            agent_runs::start_workspace_run,
            agent_runs::stop_workspace_run,
            agent_runs::get_workspace_runs,
            agent_runs::get_workspace_run_logs,
            checkpoints::list_workspace_checkpoints,
            checkpoints::create_workspace_checkpoint,
            checkpoints::get_workspace_checkpoint_diff,
            checkpoints::get_workspace_checkpoint_restore_plan,
            checkpoints::restore_workspace_checkpoint,
            checkpoints::delete_workspace_checkpoint,
            checkpoints::create_branch_from_workspace_checkpoint,
            coordinator_commands::get_workspace_coordinator_status,
            coordinator_commands::start_workspace_coordinator,
            coordinator_commands::step_workspace_coordinator,
            coordinator_commands::stop_workspace_coordinator,
            coordinator_commands::replay_workspace_coordinator_action,
            git_review::get_workspace_changed_files,
            git_review::get_workspace_file_diff,
            review_summary::get_workspace_review_summary,
            review_summary::refresh_workspace_review_summary,
            merge_readiness::get_workspace_merge_readiness,
            merge_readiness::refresh_workspace_merge_readiness,
            pr_draft::get_workspace_pr_draft,
            pr_draft::refresh_workspace_pr_draft,
            pr_draft::create_workspace_pr,
            pr_draft::get_workspace_pr_status,
            prompt_templates::list_workspace_prompt_templates,
            terminal::create_workspace_terminal,
            terminal::check_shell_command_safety,
            terminal::attach_workspace_terminal_session,
            terminal::write_workspace_terminal_session_input,
            terminal::approve_workspace_terminal_command,
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
            terminal::batch_dispatch_workspace_agent_prompt,
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
            workspace_health::get_workspace_conflicts,
            workspace_health::recover_workspace_sessions,
            workspace_readiness::get_workspace_readiness,
            workspace_cleanup::cleanup_workspace,
            workspace_file_tree::list_workspace_file_tree,
            workspace_file_tree::read_workspace_file,
            workspace_file_tree::write_workspace_file,
            workspace_file_tree::create_workspace_directory,
            workspace_file_tree::rename_workspace_path,
            workspace_file_tree::delete_workspace_path,
            workspace_ports::list_workspace_ports,
            workspace_ports::open_workspace_port,
            workspace_ports::kill_workspace_port_process,
            workspace_scripts::get_workspace_forge_config,
            workspace_scripts::run_workspace_setup,
            workspace_scripts::start_workspace_run_command,
            workspace_scripts::restart_workspace_run_command,
            workspace_scripts::stop_workspace_run_commands,
            agent_memory::list_agent_memories,
            agent_memory::set_agent_memory,
            agent_memory::delete_agent_memory,
            orchestrator_commands::get_orchestrator_status,
            orchestrator_commands::set_orchestrator_enabled,
            orchestrator_commands::set_orchestrator_model,
            workspaces::set_workspace_cost_limit,
            terminal::search_terminal_output,
            workspace_templates::list_workspace_templates,
            workspace_templates::create_workspace_template,
            workspace_templates::delete_workspace_template,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Forge Tauri application");
}
