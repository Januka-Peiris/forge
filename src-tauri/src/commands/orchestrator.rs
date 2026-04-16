use std::sync::atomic::Ordering;

use tauri::State;

use crate::models::{OrchestratorAction, OrchestratorStatus};
use crate::repositories::orchestrator_repository;
use crate::state::AppState;

#[tauri::command]
pub fn get_orchestrator_status(state: State<'_, AppState>) -> Result<OrchestratorStatus, String> {
    let enabled = state.orchestrator_enabled.load(Ordering::Relaxed);
    let model = state
        .orchestrator_model
        .lock()
        .map(|g| g.clone())
        .unwrap_or_else(|_| "claude-opus-4-6".to_string());
    let last_run_at = state
        .orchestrator_last_run
        .lock()
        .map(|g| g.clone())
        .unwrap_or(None);
    let last_actions: Vec<OrchestratorAction> = state
        .orchestrator_last_actions
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();

    // If in-memory last_run is None, fall back to DB.
    let (last_run_at, last_actions) = if last_run_at.is_none() {
        match orchestrator_repository::get_last_run(&state.db)? {
            Some((run_at, actions)) => (Some(run_at), actions),
            None => (None, last_actions),
        }
    } else {
        (last_run_at, last_actions)
    };

    Ok(OrchestratorStatus {
        enabled,
        model,
        last_run_at,
        last_actions,
    })
}

#[tauri::command]
pub fn set_orchestrator_enabled(
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<(), String> {
    state.orchestrator_enabled.store(enabled, Ordering::Relaxed);
    orchestrator_repository::save_setting(
        &state.db,
        "orchestrator_enabled",
        if enabled { "true" } else { "false" },
    )?;
    log::info!(
        target: "forge_lib",
        "orchestrator {}",
        if enabled { "enabled" } else { "disabled" }
    );
    Ok(())
}

#[tauri::command]
pub fn set_orchestrator_model(
    state: State<'_, AppState>,
    model: String,
) -> Result<(), String> {
    if let Ok(mut guard) = state.orchestrator_model.lock() {
        *guard = model.clone();
    }
    orchestrator_repository::save_setting(&state.db, "orchestrator_model", &model)
}
