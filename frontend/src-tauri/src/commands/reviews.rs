use tauri::State;

use crate::models::ReviewItem;
use crate::services::review_service;
use crate::state::AppState;

#[tauri::command]
pub fn list_pending_reviews(state: State<'_, AppState>) -> Result<Vec<ReviewItem>, String> {
    review_service::list_pending_reviews(&state)
}
