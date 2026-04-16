use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

const MISSING_TMUX: &str =
    "tmux is required for persistent terminals. Install with: brew install tmux";

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

pub fn create_session(
    name: &str,
    cwd: &Path,
    command: &str,
    args: &[String],
) -> Result<(), String> {
    let tmux = find_tmux_binary()?;
    let mut cmd = Command::new(tmux);
    cmd.arg("new-session")
        .arg("-d")
        .arg("-s")
        .arg(name)
        .arg("-c")
        .arg(cwd)
        .arg(command);
    cmd.args(args);
    run_tmux(cmd, "create tmux session")
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
    use super::sanitize_session_name;

    #[test]
    fn sanitizes_tmux_session_names() {
        assert_eq!(
            sanitize_session_name("Workspace 1 / Codex!"),
            "workspace-1-codex"
        );
        assert_eq!(sanitize_session_name("---"), "terminal");
    }
}
