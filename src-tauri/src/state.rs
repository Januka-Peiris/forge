use std::collections::HashMap;
use std::io::Write;
use std::process::Child;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::{Arc, Mutex};

use portable_pty::{ChildKiller, MasterPty};
use tauri::AppHandle;

use crate::db::Database;
use crate::models::OrchestratorAction;
use crate::repositories::{
    activity_repository, agent_chat_repository, agent_run_repository, terminal_repository,
};

pub type ProcessRegistry = Arc<Mutex<HashMap<String, Arc<Mutex<Option<Child>>>>>>;
pub type TerminalRegistry = Arc<Mutex<HashMap<String, Arc<ActiveTerminal>>>>;
/// Maps session_id → raw PTY input bytes that are pending user approval.
pub type PendingCommandRegistry = Arc<Mutex<HashMap<String, String>>>;

pub struct ActiveTerminal {
    pub session_id: String,
    pub writer: Mutex<Box<dyn Write + Send>>,
    pub killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    pub master: Mutex<Box<dyn MasterPty + Send>>,
    /// Unix timestamp in seconds of the last output received from the PTY.
    /// 0 means no output yet. Updated atomically by the reader thread.
    pub last_output_at_secs: Arc<AtomicU64>,
}

#[derive(Clone)]
pub struct AppState {
    pub app_handle: AppHandle,
    pub db: Database,
    pub processes: ProcessRegistry,
    pub terminals: TerminalRegistry,
    pub pending_commands: PendingCommandRegistry,
    /// Whether the Opus orchestrator loop is running.
    pub orchestrator_enabled: Arc<AtomicBool>,
    /// Model used for orchestrator decisions (e.g. "claude-opus-4-6").
    pub orchestrator_model: Arc<Mutex<String>>,
    /// Timestamp (unix secs) of the last orchestrator pass.
    pub orchestrator_last_run: Arc<Mutex<Option<String>>>,
    /// Actions taken in the most recent orchestrator pass.
    pub orchestrator_last_actions: Arc<Mutex<Vec<OrchestratorAction>>>,
}

impl AppState {
    pub fn initialize(app_handle: &AppHandle) -> Result<Self, String> {
        let db = Database::initialize(app_handle)?;

        // Prune old data and vacuum on startup
        if let Err(err) = db.prune_old_data() {
            log::error!(target: "forge_lib", "Failed to prune old data: {err}");
        }

        let now = crate::services::agent_process_service::timestamp();
        let interrupted_chat_groups = agent_chat_repository::list_running_chat_groups(&db)?;
        agent_chat_repository::mark_running_chats_interrupted(&db, &now)?;
        for group in interrupted_chat_groups {
            let details = format!(
                "{} running chat session(s) were marked interrupted after app restart; transcript was preserved.",
                group.count
            );
            let _ = activity_repository::record(
                &db,
                &group.workspace_id,
                &group.repo,
                Some(&group.branch),
                "Startup chat reconciliation",
                "warning",
                Some(&details),
            );
        }
        let abandoned_run_groups = agent_run_repository::list_running_run_groups(&db)?;
        agent_run_repository::mark_stale_running_abandoned(&db, &now)?;
        for group in abandoned_run_groups {
            let details = format!(
                "{} running agent run(s) were marked abandoned after app restart; logs were preserved.",
                group.count
            );
            let _ = activity_repository::record(
                &db,
                &group.workspace_id,
                &group.repo,
                Some(&group.branch),
                "Startup agent-run reconciliation",
                "warning",
                Some(&details),
            );
        }
        let stale_terminal_groups = terminal_repository::list_running_session_groups(&db)?;
        terminal_repository::mark_stale_running_sessions(&db, &now)?;
        for group in stale_terminal_groups {
            let details = format!(
                "{} running terminal session(s) were marked stale after app restart; history was preserved.",
                group.count
            );
            let _ = activity_repository::record(
                &db,
                &group.workspace_id,
                &group.repo,
                Some(&group.branch),
                "Startup session reconciliation",
                "warning",
                Some(&details),
            );
        }
        let state = Self {
            app_handle: app_handle.clone(),
            db,
            processes: Arc::new(Mutex::new(HashMap::new())),
            terminals: Arc::new(Mutex::new(HashMap::new())),
            pending_commands: Arc::new(Mutex::new(HashMap::new())),
            orchestrator_enabled: Arc::new(AtomicBool::new(false)),
            orchestrator_model: Arc::new(Mutex::new("claude-opus-4-6".to_string())),
            orchestrator_last_run: Arc::new(Mutex::new(None)),
            orchestrator_last_actions: Arc::new(Mutex::new(Vec::new())),
        };
        Ok(state)
    }
}
