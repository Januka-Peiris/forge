use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::Arc;

use mnemonic_core::services::app_runtime_service;
use mnemonic_core::services::app_runtime_service::BackgroundServiceOptions;
use mnemonic_core::state::{AppEventEmitter, AppState};

pub(crate) const GPUI_SELECTED_WORKSPACE_KEY: &str = "gpui_selected_workspace_id";

const EVENT_CHANNEL_CAPACITY: usize = 256;

#[derive(Clone, Debug)]
pub(crate) struct MnemonicEvent {
    pub name: String,
    #[allow(dead_code)]
    pub payload: serde_json::Value,
}

#[derive(Clone)]
pub(crate) struct GpuiEventEmitter {
    sender: mpsc::SyncSender<MnemonicEvent>,
}

impl AppEventEmitter for GpuiEventEmitter {
    fn emit(&self, event: &str, payload: &serde_json::Value) {
        log::debug!(target: "mnemonic_app", "event {event}: {payload}");
        let _ = self.sender.try_send(MnemonicEvent {
            name: event.to_string(),
            payload: payload.clone(),
        });
    }
}

pub(crate) fn initialize_state() -> Result<(AppState, mpsc::Receiver<MnemonicEvent>), String> {
    let data_dir = mnemonic_data_dir()?;
    let cache_dir = mnemonic_cache_dir()?;
    let (sender, receiver) = mpsc::sync_channel(EVENT_CHANNEL_CAPACITY);
    let emitter = Arc::new(GpuiEventEmitter { sender });
    let state = AppState::initialize(data_dir, cache_dir, emitter)?;
    app_runtime_service::start_background_services(
        &state,
        BackgroundServiceOptions::gpui_visible_terminal(),
    )?;
    Ok((state, receiver))
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
