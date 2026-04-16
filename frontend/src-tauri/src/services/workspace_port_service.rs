use std::path::{Path, PathBuf};
use std::process::Command;

use crate::models::WorkspacePort;
use crate::repositories::workspace_repository;
use crate::state::AppState;

#[derive(Debug, Clone, Default)]
struct RawListener {
    pid: Option<u32>,
    command: Option<String>,
    user: Option<String>,
    name: Option<String>,
}

pub fn list_workspace_ports(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<WorkspacePort>, String> {
    let root = workspace_root_path(state, workspace_id)?;
    let output = Command::new("lsof")
        .args(["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcLn"])
        .output()
        .map_err(|err| format!("Failed to scan listening ports with lsof: {err}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "lsof failed while scanning listening ports".to_string()
        } else {
            format!("lsof failed while scanning listening ports: {stderr}")
        });
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut ports = parse_lsof_listeners(&text)
        .into_iter()
        .filter_map(|listener| listener_to_workspace_port(listener, &root))
        .filter(|port| port.workspace_matched)
        .collect::<Vec<_>>();
    ports.sort_by_key(|port| port.port);
    ports.dedup_by_key(|port| (port.port, port.pid));
    Ok(ports)
}

pub fn open_workspace_port(state: &AppState, workspace_id: &str, port: u16) -> Result<(), String> {
    let _ = workspace_root_path(state, workspace_id)?;
    let url = format!("http://localhost:{port}");
    let output = Command::new("open")
        .arg(&url)
        .output()
        .map_err(|err| format!("Failed to open {url}: {err}"))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(if stderr.is_empty() {
            format!("open returned a non-zero exit code for {url}")
        } else {
            format!("Failed to open {url}: {stderr}")
        })
    }
}

pub fn kill_workspace_port_process(
    state: &AppState,
    workspace_id: &str,
    port: u16,
    pid: u32,
) -> Result<Vec<WorkspacePort>, String> {
    let current = list_workspace_ports(state, workspace_id)?;
    let target = current
        .iter()
        .any(|item| item.port == port && item.pid == pid && item.workspace_matched);
    if !target {
        return Err(format!(
            "Process {pid} is no longer a verified listener for workspace port {port}"
        ));
    }

    let output = Command::new("kill")
        .args(["-TERM", &pid.to_string()])
        .output()
        .map_err(|err| format!("Failed to kill process {pid}: {err}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("kill returned a non-zero exit code for process {pid}")
        } else {
            format!("Failed to kill process {pid}: {stderr}")
        });
    }

    Ok(list_workspace_ports(state, workspace_id).unwrap_or_default())
}

fn listener_to_workspace_port(
    listener: RawListener,
    workspace_root: &Path,
) -> Option<WorkspacePort> {
    let pid = listener.pid?;
    let name = listener.name.unwrap_or_default();
    let port = parse_port_from_name(&name)?;
    let cwd = process_cwd(pid).ok();
    let workspace_matched = cwd
        .as_deref()
        .map(|path| path_is_inside_workspace(Path::new(path), workspace_root))
        .unwrap_or(false);
    Some(WorkspacePort {
        port,
        pid,
        command: listener.command.unwrap_or_else(|| "unknown".to_string()),
        user: listener.user,
        protocol: "tcp".to_string(),
        address: name,
        cwd,
        workspace_matched,
    })
}

fn parse_lsof_listeners(text: &str) -> Vec<RawListener> {
    let mut listeners = Vec::new();
    let mut current = RawListener::default();
    for line in text.lines().filter(|line| !line.is_empty()) {
        let (field, value) = line.split_at(1);
        match field {
            "p" => {
                if current.pid.is_some() && current.name.is_some() {
                    listeners.push(std::mem::take(&mut current));
                }
                current.pid = value.parse::<u32>().ok();
            }
            "c" => current.command = Some(value.to_string()),
            "L" => current.user = Some(value.to_string()),
            "n" => {
                current.name = Some(value.to_string());
                if current.pid.is_some() {
                    listeners.push(std::mem::take(&mut current));
                }
            }
            _ => {}
        }
    }
    if current.pid.is_some() && current.name.is_some() {
        listeners.push(current);
    }
    listeners
}

fn parse_port_from_name(name: &str) -> Option<u16> {
    let before_space = name.split_whitespace().next().unwrap_or(name);
    let digits = before_space
        .rsplit_once(':')
        .map(|(_, right)| right)
        .unwrap_or(before_space)
        .chars()
        .take_while(|ch| ch.is_ascii_digit())
        .collect::<String>();
    digits.parse::<u16>().ok()
}

fn process_cwd(pid: u32) -> Result<String, String> {
    let output = Command::new("lsof")
        .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
        .output()
        .map_err(|err| format!("Failed to inspect cwd for process {pid}: {err}"))?;
    if !output.status.success() {
        return Err(format!("Could not inspect cwd for process {pid}"));
    }
    let text = String::from_utf8_lossy(&output.stdout);
    text.lines()
        .find_map(|line| line.strip_prefix('n'))
        .map(|cwd| cwd.to_string())
        .ok_or_else(|| format!("No cwd found for process {pid}"))
}

fn workspace_root_path(state: &AppState, workspace_id: &str) -> Result<PathBuf, String> {
    let workspace = workspace_repository::get_detail(&state.db, workspace_id)?
        .ok_or_else(|| format!("Workspace {workspace_id} was not found"))?;
    let path = workspace
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());
    let path = PathBuf::from(path);
    if !path.exists() || !path.is_dir() {
        return Err(format!(
            "Workspace root path is unavailable: {}",
            path.display()
        ));
    }
    Ok(path)
}

fn path_is_inside_workspace(path: &Path, workspace_root: &Path) -> bool {
    let canonical_path = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let canonical_root = workspace_root
        .canonicalize()
        .unwrap_or_else(|_| workspace_root.to_path_buf());
    canonical_path == canonical_root || canonical_path.starts_with(canonical_root)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_lsof_field_output() {
        let listeners =
            parse_lsof_listeners("p123\ncnode\nLjay\nn*:5173\np456\ncpython\nn127.0.0.1:8000\n");
        assert_eq!(listeners.len(), 2);
        assert_eq!(listeners[0].pid, Some(123));
        assert_eq!(listeners[0].command.as_deref(), Some("node"));
        assert_eq!(listeners[0].user.as_deref(), Some("jay"));
        assert_eq!(listeners[0].name.as_deref(), Some("*:5173"));
        assert_eq!(
            parse_port_from_name(listeners[1].name.as_deref().unwrap()),
            Some(8000)
        );
    }

    #[test]
    fn parses_common_listener_names() {
        assert_eq!(parse_port_from_name("*:3000"), Some(3000));
        assert_eq!(parse_port_from_name("127.0.0.1:5173"), Some(5173));
        assert_eq!(parse_port_from_name("[::1]:8080"), Some(8080));
        assert_eq!(parse_port_from_name("localhost:notaport"), None);
    }

    #[test]
    fn matches_workspace_ancestry() {
        let root = Path::new("/tmp/forge-workspace");
        assert!(path_is_inside_workspace(
            Path::new("/tmp/forge-workspace"),
            root
        ));
        assert!(path_is_inside_workspace(
            Path::new("/tmp/forge-workspace/app"),
            root
        ));
        assert!(!path_is_inside_workspace(
            Path::new("/tmp/forge-other"),
            root
        ));
    }
}
