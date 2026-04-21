use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::models::{StartWorkspaceRunInput, WorkspaceRun, WorkspaceRunLog};
use crate::repositories::{agent_run_repository, workspace_repository};
use crate::state::AppState;

pub fn start_workspace_run(
    state: &AppState,
    input: StartWorkspaceRunInput,
) -> Result<WorkspaceRun, String> {
    if agent_run_repository::active_run_for_workspace(&state.db, &input.workspace_id)?.is_some() {
        return Err("Workspace already has a running agent process".to_string());
    }

    let workspace = workspace_repository::get_detail(&state.db, &input.workspace_id)?
        .ok_or_else(|| format!("Workspace {} was not found", input.workspace_id))?;
    let cwd = workspace
        .summary
        .workspace_root_path
        .clone()
        .unwrap_or_else(|| workspace.worktree_path.clone());

    if !Path::new(&cwd).exists() {
        return Err(format!("Workspace root path does not exist: {cwd}"));
    }

    let profile = command_profile(&input.agent_type, input.prompt.as_deref())?;
    let run_id = format!("run-{}", unique_suffix());
    let started_at = timestamp();

    let mut command = Command::new(&profile.command);
    command
        .args(&profile.args)
        .current_dir(&cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    let mut child = command
        .spawn()
        .map_err(|err| format!("Failed to start {} in {}: {err}", profile.command, cwd))?;

    let pid = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let run = WorkspaceRun {
        id: run_id.clone(),
        workspace_id: input.workspace_id.clone(),
        agent_type: input.agent_type,
        command: profile.command,
        args: profile.args,
        cwd,
        status: "running".to_string(),
        pid: Some(pid),
        started_at,
        finished_at: None,
        exit_code: None,
        error_message: None,
    };

    if let Err(err) = agent_run_repository::insert_run(&state.db, &run) {
        let _ = child.kill();
        return Err(err);
    }
    append_log(&state.db, &run_id, "system", &format!("Started pid {pid}"));

    let child_handle = Arc::new(Mutex::new(Some(child)));
    state
        .processes
        .lock()
        .map_err(|_| "Process registry lock poisoned".to_string())?
        .insert(run_id.clone(), child_handle.clone());

    if let Some(stdout) = stdout {
        spawn_log_reader(state.db.clone(), run_id.clone(), "stdout", stdout);
    }
    if let Some(stderr) = stderr {
        spawn_log_reader(state.db.clone(), run_id.clone(), "stderr", stderr);
    }
    spawn_monitor(state.clone(), run_id.clone(), child_handle);

    Ok(run)
}

pub fn stop_workspace_run(state: &AppState, run_id: &str) -> Result<WorkspaceRun, String> {
    let handle = {
        let registry = state
            .processes
            .lock()
            .map_err(|_| "Process registry lock poisoned".to_string())?;
        registry.get(run_id).cloned()
    };

    if let Some(handle) = handle {
        let mut child_slot = handle
            .lock()
            .map_err(|_| "Process handle lock poisoned".to_string())?;
        if let Some(child) = child_slot.as_mut() {
            child
                .kill()
                .map_err(|err| format!("Failed to stop process: {err}"))?;
            append_log(
                &state.db,
                run_id,
                "system",
                "Stop requested; process killed",
            );
        }
    }

    let finished_at = timestamp();
    agent_run_repository::mark_finished(&state.db, run_id, "stopped", None, None, &finished_at)?;
    state
        .processes
        .lock()
        .map_err(|_| "Process registry lock poisoned".to_string())?
        .remove(run_id);

    agent_run_repository::get_run(&state.db, run_id)?
        .ok_or_else(|| format!("Run {run_id} was not found"))
}

pub fn get_workspace_runs(
    state: &AppState,
    workspace_id: &str,
) -> Result<Vec<WorkspaceRun>, String> {
    agent_run_repository::list_runs_for_workspace(&state.db, workspace_id)
}

pub fn get_workspace_run_logs(
    state: &AppState,
    run_id: &str,
) -> Result<Vec<WorkspaceRunLog>, String> {
    agent_run_repository::list_logs(&state.db, run_id)
}

pub fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

struct CommandProfile {
    command: String,
    args: Vec<String>,
}

fn command_profile(agent_type: &str, prompt: Option<&str>) -> Result<CommandProfile, String> {
    let prompt = prompt.unwrap_or("").trim();
    match agent_type {
        "codex" => Ok(CommandProfile {
            command: "codex".to_string(),
            args: if prompt.is_empty() {
                vec!["--version".to_string()]
            } else {
                vec!["exec".to_string(), prompt.to_string()]
            },
        }),
        "claude_code" => Ok(CommandProfile {
            command: "claude".to_string(),
            args: if prompt.is_empty() {
                vec!["--version".to_string()]
            } else {
                vec!["-p".to_string(), prompt.to_string()]
            },
        }),
        "kimi_code" => Ok(CommandProfile {
            command: "kimi".to_string(),
            args: if prompt.is_empty() {
                vec!["--version".to_string()]
            } else {
                vec![
                    "--print".to_string(),
                    "--final-message-only".to_string(),
                    "--prompt".to_string(),
                    prompt.to_string(),
                ]
            },
        }),
        other => Err(format!("Unsupported agent type: {other}")),
    }
}

fn spawn_log_reader<R: std::io::Read + Send + 'static>(
    db: crate::db::Database,
    run_id: String,
    stream_type: &'static str,
    reader: R,
) {
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines() {
            match line {
                Ok(line) => append_log(&db, &run_id, stream_type, &line),
                Err(err) => {
                    append_log(
                        &db,
                        &run_id,
                        "system",
                        &format!("Failed to read {stream_type}: {err}"),
                    );
                    break;
                }
            }
        }
    });
}

fn spawn_monitor(
    state: AppState,
    run_id: String,
    child_handle: Arc<Mutex<Option<std::process::Child>>>,
) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_millis(300));
        let status = {
            let mut child_slot = match child_handle.lock() {
                Ok(lock) => lock,
                Err(_) => {
                    let finished_at = timestamp();
                    let _ = agent_run_repository::mark_finished(
                        &state.db,
                        &run_id,
                        "failed",
                        None,
                        Some("Process handle lock poisoned"),
                        &finished_at,
                    );
                    break;
                }
            };

            let Some(child) = child_slot.as_mut() else {
                break;
            };

            match child.try_wait() {
                Ok(Some(status)) => {
                    *child_slot = None;
                    Some(Ok(status))
                }
                Ok(None) => None,
                Err(err) => Some(Err(err.to_string())),
            }
        };

        match status {
            Some(Ok(exit_status)) => {
                let code = exit_status.code();
                let final_status = if exit_status.success() {
                    "succeeded"
                } else {
                    "failed"
                };
                let finished_at = timestamp();
                let _ = agent_run_repository::mark_finished(
                    &state.db,
                    &run_id,
                    final_status,
                    code,
                    None,
                    &finished_at,
                );
                append_log(
                    &state.db,
                    &run_id,
                    "system",
                    &format!("Process exited with status {code:?}"),
                );
                let _ = state
                    .processes
                    .lock()
                    .map(|mut registry| registry.remove(&run_id));
                break;
            }
            Some(Err(err)) => {
                let finished_at = timestamp();
                let _ = agent_run_repository::mark_finished(
                    &state.db,
                    &run_id,
                    "failed",
                    None,
                    Some(&err),
                    &finished_at,
                );
                append_log(
                    &state.db,
                    &run_id,
                    "system",
                    &format!("Process wait failed: {err}"),
                );
                let _ = state
                    .processes
                    .lock()
                    .map(|mut registry| registry.remove(&run_id));
                break;
            }
            None => continue,
        }
    });
}

fn append_log(db: &crate::db::Database, run_id: &str, stream_type: &str, message: &str) {
    let log = WorkspaceRunLog {
        id: format!("log-{}-{}", unique_suffix(), stream_type),
        run_id: run_id.to_string(),
        timestamp: timestamp(),
        stream_type: stream_type.to_string(),
        message: message.to_string(),
    };
    let _ = agent_run_repository::insert_log(db, &log);
}

fn unique_suffix() -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{nanos}")
}
