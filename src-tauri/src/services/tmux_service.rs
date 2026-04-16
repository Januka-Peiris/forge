use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

const MISSING_TMUX: &str =
    "tmux is required for persistent terminals. Install with: brew install tmux";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersistentSessionSpec {
    pub shell: String,
    pub startup_command: Option<String>,
}

pub fn find_tmux_binary() -> Result<PathBuf, String> {
    if let Ok(path) = env::var("PATH") {
        for entry in env::split_paths(&path) {
            let candidate = entry.join("tmux");
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    for candidate in [
        "/opt/homebrew/bin/tmux",
        "/usr/local/bin/tmux",
        "/usr/bin/tmux",
    ] {
        let path = PathBuf::from(candidate);
        if path.is_file() {
            return Ok(path);
        }
    }
    Err(MISSING_TMUX.to_string())
}

pub fn sanitize_session_name(input: &str) -> String {
    let value = input
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .to_lowercase();
    if value.is_empty() {
        "terminal".to_string()
    } else {
        value
    }
}

pub fn persistent_session_spec(command: &str, args: &[String]) -> PersistentSessionSpec {
    if !should_send_startup_command(command, args) {
        return PersistentSessionSpec {
            shell: command.to_string(),
            startup_command: None,
        };
    }

    PersistentSessionSpec {
        shell: env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string()),
        startup_command: Some(shell_command_line(command, args)),
    }
}

pub fn create_persistent_session(name: &str, cwd: &Path, shell: &str) -> Result<(), String> {
    let tmux = find_tmux_binary()?;
    let mut cmd = Command::new(&tmux);
    cmd.arg("new-session")
        .arg("-d")
        .arg("-s")
        .arg(name)
        .arg("-c")
        .arg(cwd)
        .arg(shell);
    run_tmux(cmd, "create tmux session")
}

pub fn send_keys(name: &str, keys: &str) -> Result<(), String> {
    let tmux = find_tmux_binary()?;
    let mut cmd = Command::new(tmux);
    cmd.arg("send-keys")
        .arg("-t")
        .arg(name)
        .arg(keys)
        .arg("C-m");
    run_tmux(cmd, "send command to tmux session")
}

pub fn send_ctrl_c(name: &str) -> Result<(), String> {
    let tmux = find_tmux_binary()?;
    let mut cmd = Command::new(tmux);
    cmd.arg("send-keys").arg("-t").arg(name).arg("C-c");
    run_tmux(cmd, "send Ctrl-C to tmux session")
}

fn should_send_startup_command(command: &str, args: &[String]) -> bool {
    if !args.is_empty() {
        return true;
    }
    let basename = Path::new(command)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(command);
    !matches!(basename, "sh" | "bash" | "zsh" | "fish")
}

fn shell_command_line(command: &str, args: &[String]) -> String {
    std::iter::once(command)
        .chain(args.iter().map(String::as_str))
        .map(shell_quote)
        .collect::<Vec<_>>()
        .join(" ")
}

fn shell_quote(value: &str) -> String {
    if value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '/' | '.' | '_' | '-' | ':' | '='))
    {
        return value.to_string();
    }
    format!("'{}'", value.replace('\'', "'\\''"))
}

pub fn has_session(name: &str) -> bool {
    let Ok(tmux) = find_tmux_binary() else {
        return false;
    };
    Command::new(tmux)
        .arg("has-session")
        .arg("-t")
        .arg(name)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

pub fn list_sessions() -> Result<String, String> {
    let tmux = find_tmux_binary()?;
    let output = Command::new(tmux)
        .arg("list-sessions")
        .output()
        .map_err(|err| format!("Failed to list tmux sessions: {err}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(tmux_error("list tmux sessions", &output.stderr))
    }
}

pub fn missing_session_diagnostic(name: &str) -> String {
    match list_sessions() {
        Ok(sessions) if sessions.trim().is_empty() => {
            format!("tmux session '{name}' was not found. No tmux sessions are currently listed.")
        }
        Ok(sessions) => {
            format!("tmux session '{name}' was not found. Current tmux sessions:\n{sessions}")
        }
        Err(err) => format!("tmux session '{name}' was not found. Could not list sessions: {err}"),
    }
}

pub fn kill_session(name: &str) -> Result<(), String> {
    if !has_session(name) {
        return Ok(());
    }
    let tmux = find_tmux_binary()?;
    let mut cmd = Command::new(tmux);
    cmd.arg("kill-session").arg("-t").arg(name);
    run_tmux(cmd, "kill tmux session")
}

pub fn capture_scrollback(name: &str) -> Result<String, String> {
    let tmux = find_tmux_binary()?;
    let output = Command::new(tmux)
        .arg("capture-pane")
        .arg("-p")
        .arg("-S")
        .arg("-5000")
        .arg("-t")
        .arg(name)
        .output()
        .map_err(|err| format!("Failed to capture tmux scrollback: {err}"))?;
    if !output.status.success() {
        return Err(tmux_error("capture tmux scrollback", &output.stderr));
    }
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

pub fn attach_args(name: &str) -> Result<(String, Vec<String>), String> {
    let tmux = find_tmux_binary()?;
    Ok((
        tmux.to_string_lossy().to_string(),
        vec![
            "attach-session".to_string(),
            "-t".to_string(),
            name.to_string(),
        ],
    ))
}

fn run_tmux(mut cmd: Command, action: &str) -> Result<(), String> {
    let output = cmd
        .output()
        .map_err(|err| format!("Failed to {action}: {err}"))?;
    if output.status.success() {
        Ok(())
    } else {
        Err(tmux_error(action, &output.stderr))
    }
}

fn tmux_error(action: &str, stderr: &[u8]) -> String {
    let message = String::from_utf8_lossy(stderr).trim().to_string();
    if message.is_empty() {
        format!("Failed to {action}")
    } else {
        format!("Failed to {action}: {message}")
    }
}

#[cfg(test)]
mod tests {
    use super::{persistent_session_spec, sanitize_session_name, shell_command_line};

    #[test]
    fn sanitizes_tmux_session_names() {
        assert_eq!(
            sanitize_session_name("Workspace 1 / Codex!"),
            "workspace-1-codex"
        );
        assert_eq!(sanitize_session_name("---"), "terminal");
    }

    #[test]
    fn keeps_plain_shell_as_session_process() {
        let spec = persistent_session_spec("/bin/zsh", &[]);
        assert_eq!(spec.shell, "/bin/zsh");
        assert_eq!(spec.startup_command, None);
    }

    #[test]
    fn sends_agent_as_startup_command_inside_shell() {
        let spec = persistent_session_spec("/opt/homebrew/bin/codex", &[]);
        assert!(spec.shell.ends_with("sh"));
        assert_eq!(
            spec.startup_command.as_deref(),
            Some("/opt/homebrew/bin/codex")
        );
    }

    #[test]
    fn shell_command_line_quotes_args() {
        assert_eq!(
            shell_command_line("/bin/zsh", &["-lc".to_string(), "echo hi".to_string()]),
            "/bin/zsh -lc 'echo hi'"
        );
    }
}
