use tauri::State;

use crate::models::{OpenDeepLinkInput, OpenDeepLinkResult};
use crate::services::deep_link_service;
use crate::state::AppState;

#[tauri::command]
pub fn open_deep_link(
    state: State<'_, AppState>,
    input: OpenDeepLinkInput,
) -> Result<OpenDeepLinkResult, String> {
    deep_link_service::open_deep_link(&state, input)
}
