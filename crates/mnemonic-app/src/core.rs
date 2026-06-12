use std::path::PathBuf;
use std::sync::Arc;

use mnemonic_core::services::app_runtime_service;
use mnemonic_core::services::app_runtime_service::BackgroundServiceOptions;
use mnemonic_core::state::{AppEventEmitter, AppState};

pub(crate) const GPUI_SELECTED_WORKSPACE_KEY: &str = "gpui_selected_workspace_id";

#[derive(Clone)]
pub(crate) struct GpuiEventEmitter;

impl AppEventEmitter for GpuiEventEmitter {
    fn emit(&self, event: &str, payload: &serde_json::Value) {
        log::debug!(target: "mnemonic_app", "event {event}: {payload}");
    }
}

pub(crate) fn initialize_state() -> Result<AppState, String> {
    let data_dir = mnemonic_data_dir()?;
    let cache_dir = mnemonic_cache_dir()?;
    let state = AppState::initialize(data_dir, cache_dir, Arc::new(GpuiEventEmitter))?;
    app_runtime_service::start_background_services(
        &state,
        BackgroundServiceOptions::gpui_visible_terminal(),
    )?;
    Ok(state)
}

fn mnemonic_data_dir() -> Result<PathBuf, String> {
    dirs::data_dir()
        .map(|path| path.join("dev.mnemonic.desktop"))
        .ok_or_else(|| "Could not resolve platform data directory".to_string())
}

fn mnemonic_cache_dir() -> Result<PathBuf, String> {
    dirs::cache_dir()
        .map(|path| path.join("dev.mnemonic.desktop"))
        .ok_or_else(|| "Could not resolve platform cache directory".to_string())
}
