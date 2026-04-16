use crate::models::EnvironmentCheckItem;
use crate::services::environment_service;

#[tauri::command]
pub fn check_environment() -> Vec<EnvironmentCheckItem> {
    environment_service::check_environment()
}
