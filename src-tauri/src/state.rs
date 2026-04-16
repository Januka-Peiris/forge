use std::collections::HashMap;
use std::io::Write;
use std::process::Child;
use std::sync::{Arc, Mutex};

use portable_pty::{ChildKiller, MasterPty};
use tauri::AppHandle;

use crate::db::Database;
use crate::repositories::{agent_run_repository, terminal_repository};
use crate::services::tmux_service;

pub type ProcessRegistry = Arc<Mutex<HashMap<String, Arc<Mutex<Option<Child>>>>>>;
pub type TerminalRegistry = Arc<Mutex<HashMap<String, Arc<ActiveTerminal>>>>;

pub struct ActiveTerminal {
    pub session_id: String,
    pub writer: Mutex<Box<dyn Write + Send>>,
    pub killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    pub master: Mutex<Box<dyn MasterPty + Send>>,
}

#[derive(Clone)]
pub struct AppState {
    pub app_handle: AppHandle,
    pub db: Database,
    pub processes: ProcessRegistry,
    pub terminals: TerminalRegistry,
}

impl AppState {
    pub fn initialize(app_handle: &AppHandle) -> Result<Self, String> {
        let db = Database::initialize(app_handle)?;
        
        // Prune old data and vacuum on startup
        if let Err(err) = db.prune_old_data() {
            log::error!(target: "forge_lib", "Failed to prune old data: {err}");
        }

        let now = crate::services::agent_process_service::timestamp();
        agent_run_repository::mark_stale_running_abandoned(&db, &now)?;
        terminal_repository::mark_stale_running_sessions(&db, &now)?;
        for session in terminal_repository::list_running_tmux_sessions(&db)? {
            let missing = session
                .tmux_session_name
                .as_deref()
                .map(|name| !tmux_service::has_session(name))
                .unwrap_or(true);
            if missing {
                terminal_repository::mark_finished(&db, &session.id, "interrupted", &now, true)?;
            }
        }
        let state = Self {
            app_handle: app_handle.clone(),
            db,
            processes: Arc::new(Mutex::new(HashMap::new())),
            terminals: Arc::new(Mutex::new(HashMap::new())),
        };
        Ok(state)
    }
}
