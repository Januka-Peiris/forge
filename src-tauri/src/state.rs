use mnemonic_core::state::AppEventEmitter;
use tauri::{AppHandle, Emitter};

pub type AppState = mnemonic_core::state::AppState;

#[derive(Clone)]
pub struct TauriEventEmitter {
    app_handle: AppHandle,
}

impl TauriEventEmitter {
    pub fn new(app_handle: AppHandle) -> Self {
        Self { app_handle }
    }
}

impl AppEventEmitter for TauriEventEmitter {
    fn emit(&self, event: &str, payload: &serde_json::Value) {
        if let Err(err) = self.app_handle.emit(event, payload.clone()) {
            log::warn!(target: "mnemonic_lib", "failed to emit {event}: {err}");
        }
    }
}
