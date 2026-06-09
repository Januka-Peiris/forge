use std::path::Path;
use std::process::Command;

use super::{enriched_path, TerminalCommandSpec};

pub(super) fn available() -> bool {
    Command::new("tmux")
        .arg("-V")
        .env("PATH", enriched_path())
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub(super) fn safe_session_name(workspace_id: &str, session_id: &str) -> String {
    let raw = format!("mnemonic-{workspace_id}-{session_id}");
    let mut name = raw
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    name.truncate(180);
    name
}

pub(super) fn session_exists(name: &str) -> bool {
    Command::new("tmux")
        .args(["has-session", "-t", name])
        .env("PATH", enriched_path())
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub(super) fn start_detached(
    name: &str,
    cwd: &Path,
    command_spec: &TerminalCommandSpec,
) -> Result<(), String> {
    let shell_command = shell_command(command_spec);
    let output = Command::new("tmux")
        .args(["new-session", "-d", "-s", name, "-c"])
        .arg(cwd)
        .arg(shell_command)
        .env("TERM", "xterm-256color")
        .env("PATH", enriched_path())
        .output()
        .map_err(|err| format!("Failed to start tmux: {err}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("tmux failed to start session {name}")
        } else {
            format!("tmux failed to start session {name}: {stderr}")
        })
    }
}

pub(super) fn kill_session(name: &str) -> Result<(), String> {
    let output = Command::new("tmux")
        .args(["kill-session", "-t", name])
        .env("PATH", enriched_path())
        .output()
        .map_err(|err| format!("Failed to stop tmux session: {err}"))?;
    if output.status.success() || !session_exists(name) {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("tmux failed to stop session {name}")
        } else {
            format!("tmux failed to stop session {name}: {stderr}")
        })
    }
}

pub(super) fn attach_command(name: &str) -> (String, Vec<String>) {
    (
        "tmux".to_string(),
        vec![
            "attach-session".to_string(),
            "-t".to_string(),
            name.to_string(),
        ],
    )
}

fn shell_command(command_spec: &TerminalCommandSpec) -> String {
    std::iter::once(command_spec.command.as_str())
        .chain(command_spec.args.iter().map(String::as_str))
        .map(shell_quote)
        .collect::<Vec<_>>()
        .join(" ")
}

fn shell_quote(value: &str) -> String {
    if value.is_empty() {
        return "''".to_string();
    }
    format!("'{}'", value.replace('\'', r#"'\''"#))
}
