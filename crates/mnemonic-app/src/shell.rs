use mnemonic_core::services::terminal_service;
use mnemonic_core::state::AppState;
use task::Shell;

pub(crate) fn shell_for_login() -> Shell {
    std::env::var("SHELL")
        .ok()
        .filter(|shell| !shell.trim().is_empty())
        .map(Shell::Program)
        .unwrap_or_else(|| Shell::Program("/bin/zsh".to_string()))
}

pub(crate) fn claude_shell(state: Option<&AppState>, workspace_id: &str) -> Result<Shell, String> {
    let state = state.ok_or_else(|| "Mnemonic core is not initialized".to_string())?;
    let (program, args) = terminal_service::visible_agent_terminal_command(
        state,
        workspace_id,
        Some("claude-code"),
        Some("claude_code"),
    )?;
    Ok(Shell::WithArguments {
        program,
        args,
        title_override: Some("Claude".to_string()),
    })
}
