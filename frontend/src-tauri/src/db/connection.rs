use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use super::migrations;

#[derive(Debug, Clone)]
pub struct Database {
    connection: Arc<Mutex<Connection>>,
    path: PathBuf,
}

fn configure_connection(connection: &Connection) -> Result<(), String> {
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(|err| format!("Failed to enable SQLite foreign keys: {err}"))?;
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(|err| format!("Failed to enable SQLite WAL mode: {err}"))?;
    connection
        .pragma_update(None, "synchronous", "NORMAL")
        .map_err(|err| format!("Failed to set SQLite synchronous mode: {err}"))?;
    connection
        .busy_timeout(std::time::Duration::from_millis(5_000))
        .map_err(|err| format!("Failed to set SQLite busy timeout: {err}"))?;
    Ok(())
}

impl Database {
    pub fn initialize(app_handle: &AppHandle) -> Result<Self, String> {
        let app_data_dir = app_handle
            .path()
            .app_data_dir()
            .map_err(|err| format!("Failed to resolve app data directory: {err}"))?;

        fs::create_dir_all(&app_data_dir)
            .map_err(|err| format!("Failed to create app data directory: {err}"))?;

        let path = app_data_dir.join("forge.sqlite3");
        let connection = Connection::open(&path).map_err(|err| {
            format!(
                "Failed to open SQLite database at {}: {err}",
                path.display()
            )
        })?;

        configure_connection(&connection)?;

        migrations::run(&connection)?;

        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
            path,
        })
    }

    pub fn with_connection<T>(
        &self,
        f: impl FnOnce(&Connection) -> rusqlite::Result<T>,
    ) -> Result<T, String> {
        let connection = self
            .connection
            .lock()
            .map_err(|_| "SQLite connection lock poisoned".to_string())?;

        f(&connection).map_err(|err| format!("SQLite query failed: {err}"))
    }

    pub fn with_connection_mut<T>(
        &self,
        f: impl FnOnce(&mut Connection) -> rusqlite::Result<T>,
    ) -> Result<T, String> {
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| "SQLite connection lock poisoned".to_string())?;

        f(&mut connection).map_err(|err| format!("SQLite write failed: {err}"))
    }

    pub fn path(&self) -> &PathBuf {
        &self.path
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self, String> {
        let connection = Connection::open_in_memory()
            .map_err(|err| format!("Failed to open in-memory SQLite database: {err}"))?;
        configure_connection(&connection)?;
        migrations::run(&connection)?;

        Ok(Self {
            connection: Arc::new(Mutex::new(connection)),
            path: PathBuf::from(":memory:"),
        })
    }
}
